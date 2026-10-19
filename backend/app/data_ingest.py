"""Market-data ingestion: yfinance fetch, deterministic synthetic fallback, CSV <-> SQLite.

Load order on startup (``ensure_data``):
  1. SQLite already populated            -> use it as-is
  2. Committed CSVs in data/csv/ exist   -> rebuild SQLite from them (source = local_csv_seed)
  3. Nothing on disk                     -> seed (yfinance, falling back to synthetic paths)
"""
from __future__ import annotations

import json
import logging
import threading
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd

from . import db
from .config import (
    CSV_DIR,
    CSV_META_PATH,
    OFFLINE,
    SEED_END,
    SEED_START,
    SOURCE_CSV,
    SOURCE_YFINANCE,
    TICKERS,
)

log = logging.getLogger("statarb.data")

ORIGIN_YFINANCE = "yfinance"
ORIGIN_SYNTHETIC = "synthetic_calibrated"
MIN_ROWS = 250  # reject partial / truncated downloads

_cache_lock = threading.Lock()
_price_cache: pd.DataFrame | None = None


# --------------------------------------------------------------------------- cache
def get_prices() -> pd.DataFrame:
    """Wide adjusted-close frame, cached in memory until the next sync."""
    global _price_cache
    with _cache_lock:
        if _price_cache is None:
            _price_cache = db.load_prices()
        return _price_cache


def _invalidate() -> None:
    global _price_cache
    with _cache_lock:
        _price_cache = None


# --------------------------------------------------------------------------- yfinance
def fetch_yfinance(start: date, end: date) -> pd.DataFrame:
    """Download daily auto-adjusted closes for all tickers. Raises on any failure."""
    import yfinance as yf

    frames: dict[str, pd.Series] = {}
    for ticker in TICKERS:
        hist = yf.Ticker(ticker).history(
            start=start.isoformat(),
            end=(end + timedelta(days=1)).isoformat(),
            interval="1d",
            auto_adjust=True,
            timeout=20,
        )
        if hist is None or hist.empty or "Close" not in hist:
            raise RuntimeError(f"yfinance returned no data for {ticker}")
        close = hist["Close"].dropna()
        idx = pd.DatetimeIndex(close.index)
        if idx.tz is not None:
            idx = idx.tz_localize(None)
        close.index = idx.normalize()
        close = close[~close.index.duplicated(keep="last")]
        if len(close) < MIN_ROWS:
            raise RuntimeError(f"yfinance returned only {len(close)} rows for {ticker}")
        frames[ticker] = close.round(4)
    return pd.DataFrame(frames).sort_index()


# --------------------------------------------------------------------------- synthetic
def _sgx_calendar(start: date, end: date) -> pd.DatetimeIndex:
    """Weekdays minus fixed-date Singapore public holidays (good enough for a seed)."""
    fixed = [(1, 1), (5, 1), (8, 9), (12, 25)]
    holidays = [date(y, m, d) for y in range(start.year, end.year + 1) for m, d in fixed]
    return pd.bdate_range(start, end, freq="C", holidays=holidays)


def _ou(rng: np.random.Generator, n: int, half_life: float, sigma: float) -> np.ndarray:
    theta = np.log(2) / half_life
    x = np.zeros(n)
    shocks = rng.standard_t(df=5, size=n) * sigma / np.sqrt(5 / 3)
    for t in range(1, n):
        x[t] = x[t - 1] - theta * x[t - 1] + shocks[t]
    return x


def _bridge(rng: np.random.Generator, n: int, sigma: float) -> np.ndarray:
    walk = np.cumsum(rng.standard_t(df=4, size=n) * sigma / np.sqrt(2))
    walk -= walk[0]
    return walk - np.linspace(0, 1, n) * walk[-1]


def generate_synthetic(start: date = SEED_START, end: date = SEED_END, seed: int = 4228) -> pd.DataFrame:
    """Deterministic, cointegrated price paths anchored to 2021-2026 SGX bank levels.

    log P_i(t) = log P_i(0) + b_i * S(t) + u_i(t) [+ v_DBS(t)]
      S(t)  common "SG banking sector" factor: macro waypoints + Brownian-bridge noise
      u_i   fast OU idiosyncratic noise (half-life ~10-15d)  -> pairs are cointegrated
      v_DBS slow OU drift (half-life ~140d)                 -> DBS pairs are weaker
    Because every bank loads on the same S, log P_A - (b_A/b_B) log P_B is stationary.
    """
    rng = np.random.default_rng(seed)
    dates = _sgx_calendar(start, end)
    n = len(dates)
    t = np.linspace(0, 1, n)

    # Sector narrative: 2022 rate-hike rally, mid-2022 drawdown, Mar-2023 SVB scare,
    # 2024-25 record-NII rally, 2026 plateau.
    wp_t = [0.00, 0.10, 0.17, 0.30, 0.34, 0.48, 0.64, 0.71, 0.86, 1.00]
    wp_s = [0.00, 0.22, 0.04, 0.30, 0.14, 0.33, 0.62, 0.50, 0.92, 1.00]
    sector = np.interp(t, wp_t, wp_s) + _ou(rng, n, 60.0, 0.021)

    spec = {
        #           start    end   OU half-life  OU sigma
        "D05.SI": (29.40, 44.20, 12.0, 0.0052),
        "O39.SI": (12.10, 16.70, 10.0, 0.0050),
        "U11.SI": (26.30, 35.10, 11.0, 0.0050),
    }
    out: dict[str, np.ndarray] = {}
    for ticker, (p0, p1, hl, sig) in spec.items():
        b = np.log(p1 / p0)
        logp = np.log(p0) + b * sector + _ou(rng, n, hl, sig)
        if ticker == "D05.SI":
            logp += _ou(rng, n, 140.0, 0.0030)
        out[ticker] = np.round(np.exp(logp), 2)

    # STI ETF: diversified index, lower beta to the bank factor plus its own drift.
    b_sti = np.log(4.12 / 3.18) * 0.65
    idio = np.log(4.12 / 3.18) * 0.35 * t + _bridge(rng, n, 0.0045)
    out["ES3.SI"] = np.round(3.18 * np.exp(b_sti * sector + idio), 3)

    return pd.DataFrame(out, index=dates)


# --------------------------------------------------------------------------- CSV I/O
def write_csvs(prices: pd.DataFrame, meta: dict) -> None:
    CSV_DIR.mkdir(parents=True, exist_ok=True)
    for ticker in prices.columns:
        s = prices[ticker].dropna()
        df = pd.DataFrame({"date": s.index.strftime("%Y-%m-%d"), "adj_close": s.values})
        df.to_csv(CSV_DIR / f"{ticker}.csv", index=False)
    CSV_META_PATH.write_text(json.dumps(meta, indent=2))


def read_csvs() -> tuple[pd.DataFrame, dict] | None:
    paths = {t: CSV_DIR / f"{t}.csv" for t in TICKERS}
    if not all(p.exists() for p in paths.values()):
        return None
    series = {}
    for ticker, path in paths.items():
        df = pd.read_csv(path, parse_dates=["date"])
        series[ticker] = df.set_index("date")["adj_close"]
    meta = json.loads(CSV_META_PATH.read_text()) if CSV_META_PATH.exists() else {}
    return pd.DataFrame(series).sort_index(), meta


# --------------------------------------------------------------------------- orchestration
def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def seed(mode: str = "auto") -> dict:
    """Populate CSVs + SQLite. mode: 'auto' (yfinance -> synthetic), 'yfinance', 'synthetic'."""
    prices, origin, note = None, None, ""
    if mode in ("auto", "yfinance") and not OFFLINE:
        try:
            end = date.today()
            prices = fetch_yfinance(end - timedelta(days=5 * 365 + 2), end)
            origin = ORIGIN_YFINANCE
        except Exception as exc:  # network down, rate-limited, schema change...
            note = f"yfinance unavailable ({type(exc).__name__}: {exc})"
            log.warning(note)
            if mode == "yfinance":
                raise
    if prices is None:
        prices, origin = generate_synthetic(), ORIGIN_SYNTHETIC

    meta = {"origin": origin, "generated_at": _now(), "note": note}
    write_csvs(prices, meta)
    db.replace_prices(prices, {**meta, "source": SOURCE_CSV, "loaded_at": _now()})
    _invalidate()
    return {**meta, "rows": int(prices.notna().sum().sum())}


def ensure_data() -> str:
    """Make sure SQLite is populated. Returns a short description of what happened."""
    if db.coverage():
        return "sqlite"
    loaded = read_csvs()
    if loaded is not None:
        prices, meta = loaded
        db.replace_prices(prices, {**meta, "source": SOURCE_CSV, "loaded_at": _now()})
        _invalidate()
        return "csv"
    seed("auto")
    return "seeded"


def sync_from_yfinance() -> dict:
    """Refresh CSV + SQLite from yfinance. Never raises; existing data kept on failure."""
    if OFFLINE:
        return {"ok": False, "message": "Offline mode (STATARB_OFFLINE=1); kept local data."}
    try:
        end = date.today()
        prices = fetch_yfinance(end - timedelta(days=5 * 365 + 2), end)
    except Exception as exc:
        return {
            "ok": False,
            "message": f"yfinance unavailable, kept local data ({type(exc).__name__}: {exc})",
        }
    meta = {"origin": ORIGIN_YFINANCE, "generated_at": _now(), "note": ""}
    write_csvs(prices, meta)
    db.replace_prices(prices, {**meta, "source": SOURCE_YFINANCE, "loaded_at": _now()})
    _invalidate()
    return {"ok": True, "message": f"Synced {int(prices.notna().sum().sum())} rows from yfinance."}

