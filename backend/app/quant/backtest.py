"""Event-driven mean-reversion pairs-trading backtester.

Bias controls
-------------
* Formation / trading split: the static hedge ratio (alpha, beta) is estimated ONLY on the
  first ``train_split_ratio`` of the sample. Trades are only taken in the remaining
  out-of-sample window. In ``rolling`` mode beta_t is estimated from the previous
  ``hedge_window`` bars (shifted by one bar) so it never sees bar t.
* The rolling Z-score at bar t uses spread values up to and including t only.
* Signals are generated on the close of bar t and filled at the close of bar
  t + ``execution_lag`` (default 1), so no trade is filled at a price used to generate it.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..config import BENCHMARK, RISK_FREE_RATE
from .metrics import drawdown, return_stats, trade_stats
from .stats import analyze_pair

LONG_SPREAD, SHORT_SPREAD = 1, -1
DIRECTION_LABEL = {LONG_SPREAD: "LONG_SPREAD", SHORT_SPREAD: "SHORT_SPREAD"}


@dataclass
class BacktestParams:
    asset_a: str = "D05.SI"
    asset_b: str = "O39.SI"
    start_date: str | None = None
    end_date: str | None = None
    train_split_ratio: float = 0.3
    lookback_window: int = 30
    entry_z: float = 2.0
    exit_z: float = 0.2
    stop_loss_z: float = 3.5
    initial_capital: float = 100_000.0
    transaction_cost_bps: float = 15.0
    hedge_mode: str = "static"          # "static" | "rolling"
    hedge_window: int = 120             # bars for rolling OLS
    execution_lag: int = 1              # 0 = fill at signal close, 1 = next close
    gross_leverage: float = 1.0         # gross notional (|A| + |B|) as multiple of equity
    lot_size: int = 100                 # SGX board lot


class BacktestError(ValueError):
    pass


def _validate(p: BacktestParams) -> None:
    if p.asset_a == p.asset_b:
        raise BacktestError("asset_a and asset_b must differ")
    if not 0.1 <= p.train_split_ratio <= 0.8:
        raise BacktestError("train_split_ratio must be within [0.1, 0.8]")
    if p.lookback_window < 5:
        raise BacktestError("lookback_window must be >= 5")
    if not 0 <= p.exit_z < p.entry_z < p.stop_loss_z:
        raise BacktestError("Require 0 <= exit_z < entry_z < stop_loss_z")
    if p.initial_capital <= 0 or p.transaction_cost_bps < 0 or p.gross_leverage <= 0:
        raise BacktestError("initial_capital/gross_leverage must be > 0 and costs >= 0")
    if p.hedge_mode not in ("static", "rolling"):
        raise BacktestError("hedge_mode must be 'static' or 'rolling'")
    if p.execution_lag not in (0, 1):
        raise BacktestError("execution_lag must be 0 or 1")


def run_backtest(prices: pd.DataFrame, p: BacktestParams) -> dict:
    _validate(p)
    for t in (p.asset_a, p.asset_b):
        if t not in prices.columns:
            raise BacktestError(f"Unknown ticker {t}")

    frame = prices.loc[p.start_date : p.end_date]
    data = frame[[p.asset_a, p.asset_b]].dropna()
    bench = (
        frame[BENCHMARK].reindex(data.index).ffill().bfill()
        if BENCHMARK in frame.columns
        else pd.Series(np.nan, index=data.index)
    )
    n = len(data)
    train_n = int(round(n * p.train_split_ratio))
    if train_n < max(p.lookback_window, 60) or n - train_n < 20:
        raise BacktestError(
            f"Date range too short ({n} bars): need >= {max(p.lookback_window, 60)} formation "
            "bars and >= 20 trading bars"
        )

    log_a = np.log(data[p.asset_a]).rename(p.asset_a)
    log_b = np.log(data[p.asset_b]).rename(p.asset_b)

    # ---- Formation period (in-sample) diagnostics & static hedge ratio
    formation = analyze_pair(log_a.iloc[:train_n], log_b.iloc[:train_n])

    if p.hedge_mode == "static":
        alpha_t = pd.Series(formation.alpha, index=data.index)
        beta_t = pd.Series(formation.beta, index=data.index)
    else:
        w = p.hedge_window
        beta_raw = log_a.rolling(w).cov(log_b) / log_b.rolling(w).var()
        alpha_raw = log_a.rolling(w).mean() - beta_raw * log_b.rolling(w).mean()
        # shift(1): the hedge applied on bar t is fitted on bars t-w .. t-1 only
        beta_t, alpha_t = beta_raw.shift(1), alpha_raw.shift(1)

    spread = log_a - alpha_t - beta_t * log_b
    mu = spread.rolling(p.lookback_window).mean()
    sd = spread.rolling(p.lookback_window).std(ddof=1)
    z = (spread - mu) / sd.where(sd > 1e-12)

    pa, pb = data[p.asset_a].to_numpy(), data[p.asset_b].to_numpy()
    zv, betav = z.to_numpy(), beta_t.to_numpy()
    dates = data.index
    fee_rate = p.transaction_cost_bps / 10_000

    # ---- Event loop over the out-of-sample trading window
    cash = p.initial_capital
    qa = qb = 0.0
    direction = 0
    armed = True
    cum_fees = 0.0
    open_trade: dict | None = None
    pending: dict | None = None
    trades: list[dict] = []
    rows: list[dict] = []

    def mtm(i: int) -> float:
        return cash + qa * pa[i] + qb * pb[i]

    def open_position(i: int, d: int, sig_i: int) -> None:
        nonlocal cash, qa, qb, direction, cum_fees, open_trade
        beta = betav[sig_i]
        if not np.isfinite(beta) or beta <= 0:
            return
        equity = mtm(i)
        notional_a = equity * p.gross_leverage / (1 + beta)
        lots_a = math.floor(notional_a / pa[i] / p.lot_size)
        lots_b = math.floor(beta * notional_a / pb[i] / p.lot_size)
        if lots_a == 0 or lots_b == 0:
            return
        qa, qb = d * lots_a * p.lot_size, -d * lots_b * p.lot_size
        fee = fee_rate * (abs(qa) * pa[i] + abs(qb) * pb[i])
        cash -= qa * pa[i] + qb * pb[i] + fee
        cum_fees += fee
        direction = d
        open_trade = {
            "direction": DIRECTION_LABEL[d],
            "entry_signal_date": dates[sig_i].strftime("%Y-%m-%d"),
            "entry_date": dates[i].strftime("%Y-%m-%d"),
            "entry_idx": i,
            "entry_z": float(zv[sig_i]),
            "hedge_ratio": float(beta),
            "shares_a": qa,
            "shares_b": qb,
            "price_a_entry": float(pa[i]),
            "price_b_entry": float(pb[i]),
            "equity_at_entry": equity,
            "entry_fee": fee,
        }

    def close_position(i: int, reason: str, sig_i: int) -> None:
        nonlocal cash, qa, qb, direction, cum_fees, open_trade
        fee = fee_rate * (abs(qa) * pa[i] + abs(qb) * pb[i])
        cash += qa * pa[i] + qb * pb[i] - fee
        cum_fees += fee
        t = open_trade
        gross = qa * (pa[i] - t["price_a_entry"]) + qb * (pb[i] - t["price_b_entry"])
        fees = t["entry_fee"] + fee
        net = gross - fees
        trades.append(
            {
                "trade_id": len(trades) + 1,
                "direction": t["direction"],
                "entry_signal_date": t["entry_signal_date"],
                "entry_date": t["entry_date"],
                "exit_signal_date": dates[sig_i].strftime("%Y-%m-%d"),
                "exit_date": dates[i].strftime("%Y-%m-%d"),
                "holding_days": i - t["entry_idx"],
                "entry_z": t["entry_z"],
                "exit_z": float(zv[sig_i]) if np.isfinite(zv[sig_i]) else None,
                "exit_reason": reason,
                "hedge_ratio": t["hedge_ratio"],
                "shares_a": t["shares_a"],
                "shares_b": t["shares_b"],
                "price_a_entry": t["price_a_entry"],
                "price_a_exit": float(pa[i]),
                "price_b_entry": t["price_b_entry"],
                "price_b_exit": float(pb[i]),
                "gross_pnl_sgd": gross,
                "fees_sgd": fees,
                "net_pnl_sgd": net,
                "return_pct": net / t["equity_at_entry"] * 100,
                "is_open": reason == "END_OF_PERIOD",
            }
        )
        qa = qb = 0.0
        direction = 0
        open_trade = None

    def execute(order: dict, i: int) -> None:
        if order["action"] == "open":
            open_position(i, order["direction"], order["signal_idx"])
        else:
            close_position(i, order["reason"], order["signal_idx"])

    def decide(i: int) -> dict | None:
        nonlocal armed
        zi = zv[i]
        if not np.isfinite(zi):
            return None
        if direction == 0:
            if not armed and abs(zi) < p.entry_z:
                armed = True  # re-arm after a stop-loss once Z is back inside the band
            if armed and p.entry_z <= abs(zi) < p.stop_loss_z:
                d = LONG_SPREAD if zi < 0 else SHORT_SPREAD
                return {"action": "open", "direction": d, "signal_idx": i}
            return None
        if direction * zi <= -p.stop_loss_z:
            armed = False
            return {"action": "close", "reason": "STOP_LOSS", "signal_idx": i}
        if abs(zi) <= p.exit_z or direction * zi >= 0:
            return {"action": "close", "reason": "MEAN_REVERSION", "signal_idx": i}
        return None

    for i in range(train_n, n):
        if pending is not None and pending["exec_idx"] == i:
            execute(pending, i)
            pending = None
        if pending is None and i < n - 1:
            order = decide(i)
            if order is not None:
                if p.execution_lag == 0:
                    execute(order, i)
                else:
                    pending = {**order, "exec_idx": i + 1}
        if i == n - 1 and direction != 0:
            close_position(i, "END_OF_PERIOD", i)

        equity = mtm(i)
        rows.append(
            {
                "date": dates[i].strftime("%Y-%m-%d"),
                "price_a": float(pa[i]),
                "price_b": float(pb[i]),
                "log_a": float(log_a.iloc[i]),
                "hedged_log_b": float(alpha_t.iloc[i] + beta_t.iloc[i] * log_b.iloc[i]),
                "spread": float(spread.iloc[i]),
                "zscore": float(zv[i]),
                "signal": direction,
                "equity": equity,
                "gross_equity": equity + cum_fees,
                "benchmark_price": float(bench.iloc[i]),
                "exposure": abs(qa) * pa[i] + abs(qb) * pb[i],
                "cash": cash,
            }
        )

    ts = pd.DataFrame(rows)
    equity = ts["equity"]
    ts["drawdown_pct"] = drawdown(equity) * 100
    ts["gross_drawdown_pct"] = drawdown(ts["gross_equity"]) * 100
    ts["norm_a"] = ts["price_a"] / ts["price_a"].iloc[0] * 100
    ts["norm_b"] = ts["price_b"] / ts["price_b"].iloc[0] * 100
    ts["benchmark"] = p.initial_capital * ts["benchmark_price"] / ts["benchmark_price"].iloc[0]

    net_stats = return_stats(equity, RISK_FREE_RATE)
    metrics = {
        **net_stats,
        **trade_stats(trades),
        "final_equity_sgd": float(equity.iloc[-1]),
        "net_profit_sgd": float(equity.iloc[-1] - p.initial_capital),
        "total_fees_sgd": cum_fees,
        "gross_total_return_pct": return_stats(ts["gross_equity"], RISK_FREE_RATE)["total_return_pct"],
        "time_in_market_pct": float((ts["signal"] != 0).mean() * 100),
        "avg_gross_exposure_sgd": float(ts.loc[ts["signal"] != 0, "exposure"].mean())
        if (ts["signal"] != 0).any()
        else 0.0,
        "risk_free_rate_pct": RISK_FREE_RATE * 100,
    }
    bench_stats = return_stats(ts["benchmark"], RISK_FREE_RATE) if ts["benchmark"].notna().all() else {}

    return {
        "params": p.__dict__,
        "formation": {
            **formation.to_dict(),
            "hedge_mode": p.hedge_mode,
            "trading_start": dates[train_n].strftime("%Y-%m-%d"),
            "trading_end": dates[-1].strftime("%Y-%m-%d"),
            "formation_bars": train_n,
            "trading_bars": n - train_n,
        },
        "metrics": metrics,
        "benchmark_metrics": bench_stats,
        "timeseries": ts.to_dict(orient="records"),
        "trades": trades,
    }
