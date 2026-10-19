"""End-to-end verification of the API and quant engine.

Run from backend/:  python -m scripts.verify
Checks strict-JSON safety (no NaN/inf), accounting identities, friction toggle,
and a causality (look-ahead) test that perturbs future prices.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app import data_ingest  # noqa: E402
from app.config import PAIRS  # noqa: E402
from app.main import app  # noqa: E402
from app.quant.backtest import BacktestParams, run_backtest  # noqa: E402

FAILURES: list[str] = []


def check(cond: bool, msg: str) -> None:
    print(("  PASS " if cond else "  FAIL ") + msg)
    if not cond:
        FAILURES.append(msg)


def strict_json(payload) -> bool:
    try:
        json.dumps(payload, allow_nan=False)
        return True
    except ValueError:
        return False


def main() -> None:
    with TestClient(app) as client:
        print("== /api/data/status")
        st = client.get("/api/data/status").json()
        print(f"  source={st['source']} origin={st['origin']} rows={st['total_rows']}")
        check(st["total_rows"] > 4000, "database has ~5y x 4 tickers of rows")

        print("== /api/cointegration")
        r = client.get("/api/cointegration")
        check(r.status_code == 200, "cointegration returns 200")
        co = r.json()
        check(strict_json(co), "cointegration payload is strict JSON")
        check(len(co["pairs"]) == 3, "three pairs evaluated")
        for p in co["pairs"]:
            hl = p["half_life_days"]
            print(
                f"  #{p['rank']} {p['label']:12s} beta={p['beta']:.3f} corr={p['correlation']:.3f} "
                f"ADF={p['adf_stat']:.2f} (p={p['adf_pvalue']:.4f}) EG p={p['eg_pvalue']:.4f} "
                f"HL={'n/a' if hl is None else f'{hl:.1f}d'} coint={p['is_cointegrated']}"
            )

        print("== /api/backtest (all pairs x hedge modes x friction)")
        for a, b in PAIRS:
            for mode in ("static", "rolling"):
                for bps in (0, 15):
                    body = {"asset_a": a, "asset_b": b, "hedge_mode": mode, "transaction_cost_bps": bps}
                    res = client.post("/api/backtest", json=body)
                    tag = f"{a}/{b} {mode} {bps}bps"
                    if res.status_code != 200:
                        check(False, f"{tag}: HTTP {res.status_code} {res.text[:200]}")
                        continue
                    d = res.json()
                    m, trades, ts = d["metrics"], d["trades"], d["timeseries"]
                    check(strict_json(d), f"{tag}: strict JSON")
                    pnl_sum = sum(t["net_pnl_sgd"] for t in trades)
                    check(abs(m["net_profit_sgd"] - pnl_sum) < 1e-4, f"{tag}: sum(trade net P&L) == equity change")
                    fee_sum = sum(t["fees_sgd"] for t in trades)
                    check(abs(m["total_fees_sgd"] - fee_sum) < 1e-4, f"{tag}: sum(trade fees) == total fees")
                    last = ts[-1]
                    check(abs(last["gross_equity"] - last["equity"] - m["total_fees_sgd"]) < 1e-4,
                          f"{tag}: gross equity - net equity == fees")
                    for t in trades:
                        g = t["shares_a"] * (t["price_a_exit"] - t["price_a_entry"]) + t["shares_b"] * (
                            t["price_b_exit"] - t["price_b_entry"])
                        if abs(g - t["gross_pnl_sgd"]) > 1e-6:
                            check(False, f"{tag}: trade {t['trade_id']} gross P&L recomputes by hand")
                            break
                        if t["entry_date"] <= t["entry_signal_date"]:
                            check(False, f"{tag}: trade {t['trade_id']} filled after signal (lag=1)")
                            break
                    if bps == 0:
                        check(m["total_fees_sgd"] == 0, f"{tag}: zero fees at 0 bps")
                    print(
                        f"    trades={m['total_trades']:3d} ret={m['total_return_pct']:7.2f}% "
                        f"sharpe={m['sharpe_ratio']} mdd={m['max_drawdown_pct']:.2f}% fees={m['total_fees_sgd']:.0f}"
                    )

        print("== GET /api/backtest + validation")
        check(client.get("/api/backtest?asset_a=O39.SI&asset_b=U11.SI&entry_z=1.5").status_code == 200,
              "GET backtest works")
        check(client.post("/api/backtest", json={"entry_z": 1.0, "exit_z": 1.5}).status_code == 422,
              "invalid z thresholds rejected with 422")
        check(client.post("/api/backtest", json={"start_date": "2026-09-01"}).status_code == 422,
              "too-short range rejected with 422")

    print("== Look-ahead / causality test")
    prices = data_ingest.get_prices()
    for mode in ("static", "rolling"):
        params = BacktestParams(asset_a="D05.SI", asset_b="O39.SI", hedge_mode=mode)
        base = run_backtest(prices, params)
        cut = len(base["timeseries"]) // 2
        cut_date = base["timeseries"][cut]["date"]
        shocked = prices.copy()
        rng = np.random.default_rng(0)
        mask = shocked.index > cut_date
        shocked.loc[mask] *= np.exp(rng.normal(0, 0.05, size=(mask.sum(), shocked.shape[1])))
        alt = run_backtest(shocked, params)
        keys = ("zscore", "signal", "equity")
        same = all(
            all(np.isclose(x[k], y[k], equal_nan=True) for k in keys)
            for x, y in zip(base["timeseries"][: cut + 1], alt["timeseries"][: cut + 1])
        )
        check(same, f"{mode}: Z-score, signals and equity up to {cut_date} unaffected by future prices")

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED")
        sys.exit(1)
    print("All checks passed.")


if __name__ == "__main__":
    main()
