"""FastAPI entrypoint for the SGX StatArb Engine."""
from __future__ import annotations

import logging
import math
import os
from contextlib import asynccontextmanager
from typing import Any, Literal

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import data_ingest, db
from .config import ALLOW_SYNC, BENCHMARK, DB_PATH, NAMES, PAIRS, TICKERS
from .quant.backtest import BacktestError, BacktestParams, run_backtest
from .quant.stats import analyze_pair
from .static_site import mount_frontend

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("statarb.api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    outcome = data_ingest.ensure_data()
    log.info("Market data ready (%s): %s", outcome, db.coverage())
    yield


app = FastAPI(title="SGX StatArb Engine", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


def clean(obj: Any) -> Any:
    """Recursively make a payload strict-JSON safe (NaN/inf -> None, numpy -> python)."""
    if isinstance(obj, dict):
        return {k: clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        f = float(obj)
        return round(f, 8) if math.isfinite(f) else None
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    return obj


# --------------------------------------------------------------------------- meta
@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/tickers")
def tickers() -> dict:
    return {
        "tickers": [{"ticker": t, "name": NAMES[t]} for t in TICKERS],
        "pairs": [{"asset_a": a, "asset_b": b, "label": f"{NAMES[a]} / {NAMES[b]}"} for a, b in PAIRS],
        "benchmark": BENCHMARK,
    }


# --------------------------------------------------------------------------- data
@app.get("/api/data/status")
def data_status() -> dict:
    meta = db.read_meta()
    cov = db.coverage()
    return {
        "source": meta.get("source"),
        "origin": meta.get("origin"),
        "generated_at": meta.get("generated_at"),
        "loaded_at": meta.get("loaded_at"),
        "note": meta.get("note") or None,
        "database": str(DB_PATH.name),
        "total_rows": sum(c["rows"] for c in cov),
        "coverage": [{**c, "name": NAMES.get(c["ticker"], c["ticker"])} for c in cov],
        "sync_enabled": ALLOW_SYNC,
    }


@app.post("/api/data/sync")
def data_sync() -> dict:
    if not ALLOW_SYNC:
        raise HTTPException(403, "Live sync is disabled to keep the demo dataset fixed (set STATARB_ALLOW_SYNC=1).")
    result = data_ingest.sync_from_yfinance()
    return {**result, "status": data_status()}


# --------------------------------------------------------------------------- quant
def _log_prices(start: str | None, end: str | None) -> pd.DataFrame:
    prices = data_ingest.get_prices()
    if prices.empty:
        raise HTTPException(503, "No market data loaded")
    return np.log(prices.loc[start:end])


@app.get("/api/cointegration")
def cointegration(
    start_date: str | None = Query(None, description="YYYY-MM-DD"),
    end_date: str | None = Query(None, description="YYYY-MM-DD"),
    window: Literal["formation", "full"] = Query(
        "formation", description="formation = first train_split_ratio of the range (what the backtest fits on)"
    ),
    train_split_ratio: float = Query(0.3, ge=0.1, le=0.8),
) -> dict:
    logp = _log_prices(start_date, end_date)
    results = []
    for a, b in PAIRS:
        pair = logp[[a, b]].dropna()
        if window == "formation":
            # Same slice the backtester uses to fit alpha/beta, so the scanner never sees the traded period.
            pair = pair.iloc[: int(round(len(pair) * train_split_ratio))]
        try:
            stats = analyze_pair(pair[a].rename(a), pair[b].rename(b)).to_dict()
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        results.append({**stats, "label": f"{NAMES[a]} / {NAMES[b]}", "name_a": NAMES[a], "name_b": NAMES[b]})
    results.sort(key=lambda r: r["eg_pvalue"])
    for rank, r in enumerate(results, 1):
        r["rank"] = rank
    return clean({"pairs": results, "significance": 0.05, "window": window})


class BacktestRequest(BaseModel):
    asset_a: str = "D05.SI"
    asset_b: str = "O39.SI"
    start_date: str | None = None
    end_date: str | None = None
    train_split_ratio: float = Field(0.3, ge=0.1, le=0.8)
    lookback_window: int = Field(30, ge=5, le=250)
    entry_z: float = Field(2.0, gt=0, le=10)
    exit_z: float = Field(0.2, ge=0, le=10)
    stop_loss_z: float = Field(3.5, gt=0, le=20)
    initial_capital: float = Field(100_000, gt=0)
    transaction_cost_bps: float = Field(15, ge=0, le=500)
    hedge_mode: Literal["static", "rolling"] = "static"
    hedge_window: int = Field(120, ge=20, le=750)
    execution_lag: int = Field(1, ge=0, le=1)
    gross_leverage: float = Field(1.0, gt=0, le=5)
    lot_size: int = Field(100, ge=1)


def _run(req: BacktestRequest) -> dict:
    prices = data_ingest.get_prices()
    if prices.empty:
        raise HTTPException(503, "No market data loaded")
    try:
        result = run_backtest(prices, BacktestParams(**req.model_dump()))
    except BacktestError as exc:
        raise HTTPException(422, str(exc)) from exc
    result["labels"] = {"asset_a": NAMES.get(req.asset_a), "asset_b": NAMES.get(req.asset_b)}
    return clean(result)


@app.post("/api/backtest")
def backtest_post(req: BacktestRequest) -> dict:
    return _run(req)


@app.get("/api/backtest")
def backtest_get(
    asset_a: str = "D05.SI",
    asset_b: str = "O39.SI",
    start_date: str | None = None,
    end_date: str | None = None,
    train_split_ratio: float = 0.3,
    lookback_window: int = 30,
    entry_z: float = 2.0,
    exit_z: float = 0.2,
    stop_loss_z: float = 3.5,
    initial_capital: float = 100_000,
    transaction_cost_bps: float = 15,
    hedge_mode: Literal["static", "rolling"] = "static",
    hedge_window: int = 120,
    execution_lag: int = 1,
) -> dict:
    try:
        req = BacktestRequest(**{k: v for k, v in locals().items()})
    except Exception as exc:
        raise HTTPException(422, str(exc)) from exc
    return _run(req)


# Last, so /api/* routes win over the static catch-all (production single-container build only).
mount_frontend(app)
