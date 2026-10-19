"""Portfolio performance statistics."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from ..config import TRADING_DAYS


def _safe_div(a: float, b: float) -> float | None:
    if b is None or not np.isfinite(b) or abs(b) < 1e-12:
        return None
    return float(a / b)


def drawdown(equity: pd.Series) -> pd.Series:
    return equity / equity.cummax() - 1.0


def return_stats(equity: pd.Series, risk_free: float) -> dict:
    """Sharpe / Sortino / vol / drawdown statistics from a daily equity curve."""
    r = equity.pct_change().dropna()
    total_return = float(equity.iloc[-1] / equity.iloc[0] - 1.0)
    years = len(r) / TRADING_DAYS
    cagr = (1 + total_return) ** (1 / years) - 1 if years > 0 and total_return > -1 else None

    std = float(r.std(ddof=1)) if len(r) > 1 else 0.0
    rf_daily = risk_free / TRADING_DAYS
    excess = r - rf_daily
    downside = math.sqrt(float((np.minimum(excess, 0.0) ** 2).mean())) if len(r) else 0.0
    sharpe = _safe_div(float(excess.mean()), std)
    sharpe_rf0 = _safe_div(float(r.mean()), std)
    sortino = _safe_div(float(excess.mean()), downside)
    mdd = float(drawdown(equity).min())

    ann = math.sqrt(TRADING_DAYS)
    return {
        "total_return_pct": total_return * 100,
        "cagr_pct": cagr * 100 if cagr is not None else None,
        "annual_volatility_pct": std * ann * 100,
        "sharpe_ratio": sharpe * ann if sharpe is not None else None,
        "sharpe_ratio_rf0": sharpe_rf0 * ann if sharpe_rf0 is not None else None,
        "sortino_ratio": sortino * ann if sortino is not None else None,
        "max_drawdown_pct": mdd * 100,
        "calmar_ratio": _safe_div(cagr, abs(mdd)) if cagr is not None else None,
    }


def trade_stats(trades: list[dict]) -> dict:
    pnls = [t["net_pnl_sgd"] for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    gross_loss = abs(sum(losses))
    return {
        "total_trades": len(trades),
        "winning_trades": len(wins),
        "losing_trades": len(losses),
        "win_rate_pct": len(wins) / len(trades) * 100 if trades else None,
        "profit_factor": _safe_div(sum(wins), gross_loss) if losses else None,
        "avg_holding_days": float(np.mean([t["holding_days"] for t in trades])) if trades else None,
        "avg_trade_net_pnl_sgd": float(np.mean(pnls)) if trades else None,
        "stop_loss_exits": sum(t["exit_reason"] == "STOP_LOSS" for t in trades),
    }
