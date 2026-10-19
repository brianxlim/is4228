"""Seed SQLite + CSV market data.

Usage (from backend/):
    python -m scripts.seed                 # try yfinance, fall back to synthetic
    python -m scripts.seed --mode synthetic
    python -m scripts.seed --from-csv      # rebuild SQLite from committed CSVs only
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import data_ingest, db  # noqa: E402
from app.config import SOURCE_CSV  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["auto", "yfinance", "synthetic"], default="auto")
    ap.add_argument("--from-csv", action="store_true")
    args = ap.parse_args()

    if args.from_csv:
        loaded = data_ingest.read_csvs()
        if loaded is None:
            sys.exit("No CSVs found in data/csv/")
        prices, meta = loaded
        db.replace_prices(prices, {**meta, "source": SOURCE_CSV, "loaded_at": data_ingest._now()})
        print(f"Rebuilt SQLite from CSVs ({meta.get('origin')})")
    else:
        info = data_ingest.seed(args.mode)
        print(f"Seeded {info['rows']} rows, origin={info['origin']} {info['note']}")

    for c in db.coverage():
        print(f"  {c['ticker']:8s} rows={c['rows']:5d}  {c['start']} -> {c['end']}")


if __name__ == "__main__":
    main()
