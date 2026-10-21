"""Econometrics: OLS hedge ratio, ADF / Engle-Granger cointegration, OU half-life."""
from __future__ import annotations

import warnings
from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.tsa.stattools import adfuller, coint

SIGNIFICANCE = 0.05
MARGINAL_SIGNIFICANCE = 0.10
MAX_TRADEABLE_HALF_LIFE = 60.0  # trading days; slower spreads tie up capital for months


def tradeability(eg_pvalue: float, half_life_days: float | None) -> tuple[str, str]:
    """Go / no-go verdict for a pair: (TRADEABLE | MARGINAL | NOT_TRADEABLE, plain-English reason)."""
    hl = f"half-life {half_life_days:.0f} days" if half_life_days else "spread does not mean-revert"
    if eg_pvalue < SIGNIFICANCE and half_life_days and half_life_days <= MAX_TRADEABLE_HALF_LIFE:
        return "TRADEABLE", f"Cointegrated (p = {eg_pvalue:.3f}) and {hl}"
    if eg_pvalue < SIGNIFICANCE:
        return "MARGINAL", f"Cointegrated (p = {eg_pvalue:.3f}) but {hl} is too slow"
    if eg_pvalue < MARGINAL_SIGNIFICANCE and half_life_days:
        return "MARGINAL", f"Weak evidence (p = {eg_pvalue:.3f}, needs < 0.05); {hl}"
    return "NOT_TRADEABLE", f"No cointegration (p = {eg_pvalue:.3f}); {hl}"


@dataclass
class PairStats:
    asset_a: str
    asset_b: str
    n_obs: int
    start_date: str
    end_date: str
    correlation: float          # Pearson correlation of daily log returns
    price_correlation: float    # Pearson correlation of log price levels
    alpha: float
    beta: float                 # OLS hedge ratio on log prices
    r_squared: float
    adf_stat: float
    adf_pvalue: float           # ADF on residuals (Dickey-Fuller critical values)
    adf_crit_5pct: float
    eg_stat: float
    eg_pvalue: float            # Engle-Granger (MacKinnon residual-based critical values)
    is_cointegrated: bool
    half_life_days: float | None
    spread_std: float

    def to_dict(self) -> dict:
        verdict, reason = tradeability(self.eg_pvalue, self.half_life_days)
        return {**asdict(self), "verdict": verdict, "verdict_reason": reason}


def ols_hedge(y: np.ndarray, x: np.ndarray) -> tuple[float, float, float, np.ndarray]:
    """y = alpha + beta * x + eps. Returns (alpha, beta, r2, residuals)."""
    model = sm.OLS(y, sm.add_constant(x)).fit()
    alpha, beta = float(model.params[0]), float(model.params[1])
    return alpha, beta, float(model.rsquared), np.asarray(model.resid)


def half_life(spread: np.ndarray) -> float | None:
    """OU half-life: regress d(eps_t) on eps_{t-1}; HL = -ln(2)/lambda. None if lambda >= 0."""
    s = np.asarray(spread, dtype=float)
    if len(s) < 10:
        return None
    lagged, delta = s[:-1], np.diff(s)
    lam = float(sm.OLS(delta, sm.add_constant(lagged)).fit().params[1])
    if not np.isfinite(lam) or lam >= 0:
        return None
    return float(-np.log(2) / lam)


def analyze_pair(log_a: pd.Series, log_b: pd.Series) -> PairStats:
    """Full in-sample cointegration diagnostics for one pair of aligned log-price series."""
    df = pd.concat([log_a, log_b], axis=1, join="inner").dropna()
    if len(df) < 30:
        raise ValueError("Need at least 30 overlapping observations for cointegration tests")
    y, x = df.iloc[:, 0].to_numpy(), df.iloc[:, 1].to_numpy()

    alpha, beta, r2, resid = ols_hedge(y, x)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        adf_stat, adf_p, _, _, crit, _ = adfuller(resid, autolag="AIC")
        eg_stat, eg_p, _ = coint(y, x, trend="c", autolag="AIC")

    rets = df.diff().dropna()
    return PairStats(
        asset_a=str(log_a.name),
        asset_b=str(log_b.name),
        n_obs=len(df),
        start_date=df.index[0].strftime("%Y-%m-%d"),
        end_date=df.index[-1].strftime("%Y-%m-%d"),
        correlation=float(rets.iloc[:, 0].corr(rets.iloc[:, 1])),
        price_correlation=float(np.corrcoef(y, x)[0, 1]),
        alpha=alpha,
        beta=beta,
        r_squared=r2,
        adf_stat=float(adf_stat),
        adf_pvalue=float(adf_p),
        adf_crit_5pct=float(crit["5%"]),
        eg_stat=float(eg_stat),
        eg_pvalue=float(eg_p),
        is_cointegrated=bool(eg_p < SIGNIFICANCE),
        half_life_days=half_life(resid),
        spread_std=float(np.std(resid, ddof=1)),
    )
