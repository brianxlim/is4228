"""Central configuration: tickers, paths and data-window defaults."""
from __future__ import annotations

import os
from datetime import date
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("STATARB_DATA_DIR", BACKEND_DIR / "data"))
CSV_DIR = DATA_DIR / "csv"
DB_PATH = DATA_DIR / "market_data.db"
CSV_META_PATH = CSV_DIR / "_meta.json"

BANKS: dict[str, str] = {
    "D05.SI": "DBS",
    "O39.SI": "OCBC",
    "U11.SI": "UOB",
}
BENCHMARK = "ES3.SI"
TICKERS: list[str] = [*BANKS.keys(), BENCHMARK]
NAMES: dict[str, str] = {**BANKS, BENCHMARK: "STI ETF"}

PAIRS: list[tuple[str, str]] = [
    ("D05.SI", "O39.SI"),
    ("D05.SI", "U11.SI"),
    ("O39.SI", "U11.SI"),
]

# 5-year window ending on the seed date. The seed end date is pinned so that the
# synthetic fallback dataset is byte-for-byte reproducible.
SEED_END = date(2026, 10, 16)
SEED_START = date(2021, 10, 18)
HISTORY_YEARS = 5

TRADING_DAYS = 252
RISK_FREE_RATE = float(os.getenv("STATARB_RISK_FREE", "0.03"))  # SORA proxy
OFFLINE = os.getenv("STATARB_OFFLINE", "0") == "1"

SOURCE_YFINANCE = "yfinance_live"
SOURCE_CSV = "local_csv_seed"
