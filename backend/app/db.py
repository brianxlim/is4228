"""SQLite persistence layer for daily prices and dataset metadata."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import pandas as pd

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS daily_prices (
    ticker     TEXT NOT NULL,
    date       TEXT NOT NULL,
    adj_close  REAL NOT NULL,
    PRIMARY KEY (ticker, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_prices_date ON daily_prices(date);
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""


@contextmanager
def connect(path: Path = DB_PATH) -> Iterator[sqlite3.Connection]:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    try:
        conn.executescript(SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()


def replace_prices(prices: pd.DataFrame, meta: dict[str, str]) -> None:
    """Atomically replace all prices. `prices` is wide: index=date, columns=tickers."""
    rows = [
        (ticker, idx.strftime("%Y-%m-%d"), float(val))
        for ticker in prices.columns
        for idx, val in prices[ticker].dropna().items()
    ]
    with connect() as conn:
        conn.execute("DELETE FROM daily_prices")
        conn.executemany(
            "INSERT INTO daily_prices (ticker, date, adj_close) VALUES (?, ?, ?)", rows
        )
        conn.execute("DELETE FROM meta")
        conn.executemany("INSERT INTO meta (key, value) VALUES (?, ?)", list(meta.items()))


def load_prices() -> pd.DataFrame:
    """Return wide DataFrame of adjusted closes (index=DatetimeIndex, columns=tickers)."""
    with connect() as conn:
        long = pd.read_sql_query("SELECT ticker, date, adj_close FROM daily_prices", conn)
    if long.empty:
        return pd.DataFrame()
    long["date"] = pd.to_datetime(long["date"])
    return long.pivot(index="date", columns="ticker", values="adj_close").sort_index()


def read_meta() -> dict[str, str]:
    with connect() as conn:
        return dict(conn.execute("SELECT key, value FROM meta").fetchall())


def coverage() -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT ticker, COUNT(*), MIN(date), MAX(date) FROM daily_prices GROUP BY ticker ORDER BY ticker"
        ).fetchall()
    return [{"ticker": t, "rows": n, "start": s, "end": e} for t, n, s, e in rows]
