# SGX StatArb Engine: Pairs Trading & Cointegration PoC

An interactive web app for a university fintech project (IS4228). It asks one question: **can you make money by betting that Singapore's three big banks keep moving together?**

## Background

### The idea: pairs trading
Some stocks move together because the same things drive them. Singapore's three listed banks are **DBS**, **OCBC** and **UOB**. They earn money the same way, in the same economy, under the same interest rates and the same regulator. When rates rise, all three tend to rise. When the region has a scare, all three tend to fall.

They don't move in perfect lockstep, though. Sometimes one bank pulls ahead of another for a few weeks for no lasting reason. **Pairs trading** bets that these gaps are temporary:

1. Watch the price gap between two related stocks (the **spread**).
2. When the gap gets unusually wide, **buy the one that fell behind and short-sell the one that ran ahead**.
3. When the gap closes back to normal, **close both positions** and keep the difference.

You hold one stock long and the other short, so a market-wide rise or fall mostly cancels out. The profit comes only from the gap closing. This is called a **market-neutral** or **statistical arbitrage ("stat arb")** strategy. It is a classic hedge-fund technique.

### The catch: correlated isn't the same as cointegrated
Two stocks can be highly **correlated** (they go up and down on the same days) while their gap still drifts further apart for years. Pairs trading only works if the gap keeps coming back. Statisticians call this property **cointegration**: the two prices may wander, but the spread between them is **mean-reverting** (it keeps getting pulled back to an average).

That is why the project tests for cointegration *before* trading, and why it measures the **half-life**, the typical number of days the gap takes to close halfway. A short half-life means quick, frequent trades. A long or infinite half-life means the gap may never close.

### What this app does
1. **Loads 5 years of daily prices** for DBS (`D05.SI`), OCBC (`O39.SI`) and UOB (`U11.SI`), plus the **STI ETF** (`ES3.SI`). The STI ETF tracks Singapore's main stock index and serves as a "just buy the market" comparison. Prices come from Yahoo Finance and are saved locally, so the app works offline.
2. **Scans the three possible pairs** (DBS/OCBC, DBS/UOB, OCBC/UOB). For each pair it reports:
   - how correlated they are;
   - whether they are statistically cointegrated;
   - the **hedge ratio**: how many dollars of one bank offset one dollar of the other;
   - the half-life.
3. **Backtests the strategy**: it replays history day by day as if you had traded the rules above with S$100,000. It charges realistic SGX trading costs and records every trade.
4. **Shows the results** on a dashboard:
   - profit, risk (Sharpe ratio, worst drawdown) and win rate;
   - charts of the gap, the trades and the account balance against the STI ETF;
   - a trade log you can export to Excel.

   All the strategy settings are sliders, so you can change them live.

To keep the test honest, the strategy only uses information that would have been available at the time. The hedge ratio is fitted on the first 30% of the data, the strategy is then tested on the remaining 70%, and every trade fills on the *next* day's price. Section 3 has the details.

### The headline result
On real 2021–2026 prices, **none of the three pairs passes the cointegration test**, and the strategy loses money on all of them. The banks are about 70% correlated, but in 2024 DBS re-rated well ahead of the other two, and the "temporary" gap never closed. Trading costs make the losses worse. Section 5 has the numbers. A negative result like this is the main lesson of the project: strongly correlated stocks are not automatically a profitable pair.

### Glossary
| Term | Plain meaning |
|---|---|
| **Spread** | The gap between the two (log) prices after adjusting by the hedge ratio |
| **Z-score** | How unusual today's spread is: the number of standard deviations from its recent average. ±2 means "unusually wide". |
| **Long / short the spread** | Buy the cheap leg and short the expensive leg (or the reverse) |
| **Stop-loss** | Give up on a trade if the gap keeps widening past an extreme level (default ±3.5) |
| **Backtest** | Simulating a strategy on historical data to see how it would have performed |
| **In-sample / out-of-sample** | The data used to set up the strategy vs. the later data used to test it |
| **bps (basis points)** | Hundredths of a percent; 15 bps = 0.15% per trade leg |
| **Sharpe ratio** | Return per unit of risk, after subtracting a 3% risk-free rate; above 1 is good, below 0 means worse than cash |
| **Drawdown** | The largest peak-to-trough fall in the account balance |

## Tech stack
- **Backend:** Python 3.11, FastAPI, pandas/numpy, statsmodels (OLS, ADF, Engle-Granger), and SQLite with committed CSVs.
- **Frontend:** Next.js 15 (App Router), React 18, TypeScript, Tailwind CSS 4, Recharts and Lucide icons.

```
project/
├── backend/
│   ├── app/
│   │   ├── main.py            FastAPI routes + strict-JSON sanitiser
│   │   ├── config.py          tickers, pairs, paths, risk-free rate
│   │   ├── db.py              SQLite schema / IO (daily_prices, meta)
│   │   ├── data_ingest.py     yfinance fetch, synthetic fallback, CSV <-> SQLite
│   │   └── quant/
│   │       ├── stats.py       OLS hedge ratio, ADF, Engle-Granger, OU half-life
│   │       ├── backtest.py    event-driven pairs backtester (OOS, T+1 fills)
│   │       └── metrics.py     Sharpe, Sortino, drawdown, win rate, profit factor
│   ├── data/csv/*.csv         committed price history (+ _meta.json provenance)
│   ├── data/market_data.db    SQLite (rebuilt from CSVs automatically if missing)
│   └── scripts/
│       ├── seed.py            populate CSV + SQLite
│       └── verify.py          end-to-end API + quant verification suite
├── frontend/src/
│   ├── app/page.tsx           dashboard state, debounced auto-backtest
│   ├── components/            Header, PairScanner, Controls, KpiRibbon, Charts, TradeLog
│   └── lib/                   API client, types, formatters
├── start.ps1 / start.sh / Makefile
└── .env.example
```

---

## 1. Setup

Prerequisites: Python ≥ 3.11 and **Node ≥ 20** (22 LTS recommended). Next.js 15 needs ≥ 18.18, and Tailwind 4's engine needs ≥ 20.

**Windows (PowerShell)**
```powershell
.\start.ps1 -Install      # creates venv, pip + npm install, launches both servers
```

**macOS / Linux**
```bash
make install && make dev
```

Then open **http://localhost:3000**. Interactive API docs are at http://localhost:8000/docs.

Useful commands (run inside `backend/` with the venv's Python):

| Command | Purpose |
|---|---|
| `python -m scripts.seed` | Fetch 5y from yfinance. Falls back to synthetic paths if offline |
| `python -m scripts.seed --mode synthetic` | Deterministic, offline, calibrated dataset |
| `python -m scripts.seed --from-csv` | Rebuild SQLite from the committed CSVs only |
| `python -m scripts.verify` | Run the verification suite (≈60 checks) |

The start scripts set `STATARB_OFFLINE=1`, so the app never touches the network during a live demo.

### Production: one container (Docker / Cloud Run)
In production, the dashboard is exported as static files and served by FastAPI alongside `/api/*`. That gives one container, one URL and no CORS setup. The image runs offline from the committed CSVs, as a non-root user, on `$PORT` (default 8080).

```bash
docker compose up --build        # then open http://localhost:8080
```

To deploy to **Google Cloud Run** (Singapore region, scales to zero), first log in once with `gcloud auth login`. Then run:

```powershell
.\deploy\cloudrun.ps1 -Project <your-gcp-project-id>
```

The script enables the Cloud Run, Cloud Build and Artifact Registry APIs, builds the `Dockerfile` remotely with Cloud Build, deploys the service and smoke-tests `/api/health`. A low-traffic class demo should fit in the free tier. With zero minimum instances, expect a cold start of a few seconds on the first request.

**Cost safety.** Google Cloud has no instant spending cap, so the live deployment is protected in layers:
1. **Locked by default.** Ingress is set to `internal`, so public requests get a 404 from Google's front end and never reach the container.
   - Run `.\deploy\demo-unlock.ps1` just before presenting.
   - Run `.\deploy\demo-lock.ps1` afterwards.
2. **Small footprint.** At most 1 instance with 512 MiB, which limits how much a traffic flood can consume.
3. **S$10 budget.** It sends email alerts at S$5, S$9 and S$10 and publishes to the Pub/Sub topic `billing-kill-switch`.
4. **Kill switch.** The function in [`deploy/kill_switch/`](deploy/kill_switch/main.py) unlinks billing from the project once reported cost reaches the budget.
   - It uses a dedicated service account with only *Project Billing Manager* on this project.
   - Budget data lags by hours, so this caps runaway costs but is not instant.
   - Unlinking stops the site. To restore it: `gcloud billing projects link <project> --billing-account <id>`.

A prepaid or virtual card limit does **not** cap what you owe Google. Delete the project once grading is done.

**CI:** `.github/workflows/ci.yml` runs on every PR to `main`:
- the backend verification suite;
- frontend typecheck, build and `npm audit`;
- a Docker image build.

**Python versions** are pinned exactly: direct dependencies in `backend/requirements.txt`, the full tree in `backend/requirements.lock`. These pins need **Python 3.11+**.

### Data loading order (startup)
1. If `market_data.db` already has rows, it is used as is.
2. Otherwise SQLite is rebuilt from `data/csv/*.csv`. The source shows as `local_csv_seed`.
3. If there are no CSVs either, the app seeds from yfinance. If that fails, it falls back to the synthetic generator.

**Live sync is off by default** so a stray click can't replace the committed dataset and shift the demo numbers. The "Sync Yahoo Finance" button and `POST /api/data/sync` only work when the backend runs with `STATARB_ALLOW_SYNC=1`; otherwise the button is hidden and the endpoint returns 403. When enabled, a successful sync sets the source to `yfinance_live`; a failed one returns `ok: false` and **keeps the existing data**.

The committed CSVs hold **real Yahoo Finance adjusted closes, 2021-10-18 → 2026-10-19** (`_meta.json` records the provenance).

## 2. Architecture trade-offs

| Decision | Why |
|---|---|
| **SQLite + committed CSVs** | A live demo can't depend on Yahoo's rate limits or venue Wi-Fi. CSVs are diff-able, human-auditable and versioned. SQLite gives fast, indexed, SQL-queryable access, and the app rebuilds it from the CSVs, so the results are byte-for-byte reproducible on any machine. |
| **Synthetic fallback** | If yfinance is unavailable on first run, the app generates seeded (`seed=4228`), deterministic paths. Each bank loads on a common "SG banking-sector" factor plus Ornstein-Uhlenbeck idiosyncratic noise, which makes the pairs cointegrated by construction. The paths are anchored to 2021–26 price levels (DBS ≈ 28–48, OCBC ≈ 12–17, UOB ≈ 25–36). The UI labels this source as *synthetic calibrated seed* so it is never mistaken for market data. |
| **Event-driven loop (not vectorised)** | The loop has explicit cash, share and fee accounting, plus re-arm-after-stop state, T+1 fills and board-lot rounding. Every trade can be reproduced by hand from the exported CSV. |
| **Strict-JSON sanitiser** | All NaN and ±inf values become `null` before serialisation, so the API never emits invalid JSON. |
| **Recharts** | Composable `syncId` cross-chart tooltips, `ReferenceLine` Z thresholds, `ReferenceArea` holding-period shading and custom marker glyphs. |

## 3. Econometrics

**Hedge ratio (OLS on log prices)**, estimated on the formation window only:

$$y_t=\log P_{A,t},\quad x_t=\log P_{B,t},\qquad y_t=\alpha+\beta x_t+\varepsilon_t$$

**Stationarity / cointegration**
- *ADF on the residuals* $\hat\varepsilon_t$ (`adfuller`, AIC lag selection). This test uses standard Dickey-Fuller critical values. Because $\hat\varepsilon$ is an *estimated* residual, it overstates significance.
- *Engle-Granger* (`statsmodels.tsa.stattools.coint`). This test uses MacKinnon residual-based critical values. **The verdict `is_cointegrated` = EG p < 0.05 uses this, the statistically correct test.** The UI shows both p-values.

**Ornstein-Uhlenbeck half-life**

$$\Delta\varepsilon_t = c + \lambda\,\varepsilon_{t-1} + u_t,\qquad \text{HL}=-\frac{\ln 2}{\lambda}\ \ (\lambda<0;\ \text{otherwise } \infty)$$

**Signal**

$$\text{Spread}_t = y_t-\alpha-\beta x_t,\qquad Z_t=\frac{\text{Spread}_t-\mu_{t,W}}{\sigma_{t,W}}$$

$\mu_{t,W}$ and $\sigma_{t,W}$ are the rolling mean and standard deviation over the last $W$ bars, **including $t$ and nothing later**.

| Condition | Action |
|---|---|
| flat, $Z_t\le -z_{entry}$ (and $|Z_t|<z_{stop}$) | **Long spread**: buy A, short β-weighted notional of B |
| flat, $Z_t\ge +z_{entry}$ | **Short spread**: short A, buy β-weighted B |
| in trade, $|Z_t|\le z_{exit}$ or Z crosses 0 | close: `MEAN_REVERSION` |
| in trade, Z moves to $\mp z_{stop}$ against us | close: `STOP_LOSS`; no re-entry until $|Z|<z_{entry}$ |
| last bar | close: `END_OF_PERIOD` |

**Sizing:** gross notional equals equity × leverage (default 1). $N_A = \frac{G}{1+\beta}$ and $N_B=\beta N_A$. Share counts are rounded down to SGX board lots of 100.

**Friction:** `transaction_cost_bps` is charged on $|q|\cdot P$ for **each leg on entry and on exit**. The default of 15 bps covers brokerage, clearing and short-borrow.

**Accounting:** $\text{Equity}_t=\text{Cash}_t+q_A P_{A,t}+q_B P_{B,t}$, with signed quantities, and short proceeds are credited to cash. Gross equity = net equity + cumulative fees.

**Metrics** (daily returns $r_t$, $R_f=3\%$ SORA, 252 days):

$$\text{Sharpe}=\sqrt{252}\,\frac{\overline{r-R_f/252}}{\sigma_r},\qquad \text{Sortino}=\sqrt{252}\,\frac{\overline{r-R_f/252}}{\sqrt{\overline{\min(r-R_f/252,0)^2}}}$$

The engine also reports max drawdown, total return, CAGR, annualised volatility, win rate, profit factor ($\sum$ wins / $|\sum$ losses$|$), average holding period in trading days, and total fees.

> Note: idle cash earns 0% in the simulation but is benchmarked against a 3% risk-free rate. This is conservative for a market-neutral book whose collateral would earn interest. `sharpe_ratio_rf0` is also returned.

### Look-ahead bias controls
1. **Formation / trading split.** α and β are fitted on the first `train_split_ratio` (default 30%) of bars only. Trades happen only after that.
2. **Rolling-hedge mode.** β_t is fitted on bars *t−w … t−1* (`shift(1)`).
3. **Causal Z-score.** The rolling window never contains future bars.
4. **T+1 execution.** Signals fire on the close of day T and fill at the close of T+1 (`execution_lag=1`; can be switched off in the UI to compare).
5. **Automated proof.** `scripts/verify.py` multiplies every price *after* a cut date by random noise and asserts that all Z-scores, signals and equity values *before* the cut are unchanged.

## 4. API

| Method | Path | Description |
|---|---|---|
| GET | `/api/data/status` | row counts, coverage, `source` (`yfinance_live` / `local_csv_seed`), `origin` |
| POST | `/api/data/sync` | refresh CSV + SQLite from yfinance; 403 unless `STATARB_ALLOW_SYNC=1` |
| GET | `/api/cointegration?start_date&end_date&window=formation\|full&train_split_ratio=0.3` | 3 pairs ranked by EG p-value: ρ, β, ADF stat/p, EG p, half-life, and a `verdict` (`TRADEABLE` / `MARGINAL` / `NOT_TRADEABLE`) with a plain-English `verdict_reason`. `window=formation` (default) tests only the in-sample slice the backtest fits on. |
| POST/GET | `/api/backtest` | params below → `formation`, `metrics`, `benchmark_metrics`, `timeseries[]`, `trades[]` |

Backtest parameters (defaults): `asset_a=D05.SI`, `asset_b=O39.SI`, `start_date`, `end_date`, `train_split_ratio=0.3`, `lookback_window=30`, `entry_z=2.0`, `exit_z=0.2`, `stop_loss_z=3.5`, `initial_capital=100000`, `transaction_cost_bps=15`, `hedge_mode=static|rolling`, `hedge_window=120`, `execution_lag=1`, `gross_leverage=1.0`, `lot_size=100`.

## 5. What the real data says (2021-10 → 2026-10, default parameters)

| Pair | Verdict | EG p (formation, 377 days) | EG p (full 5y) | Sharpe @15 bps | Net return @15 bps | Net @0 bps |
|---|---|---|---|---|---|---|
| DBS / UOB | Not tradeable | 0.551 | 0.132 | −1.65 | −22.1% | −17.8% |
| OCBC / UOB | Not tradeable | 0.552 | 0.380 | −1.63 | −26.2% | −19.6% |
| DBS / OCBC | Not tradeable | 0.581 | 0.567 | −1.39 | −10.9% | −3.6% |

**None of the bank pairs is cointegrated at 5%**, whether tested on the formation window alone (what the strategy could have known before trading) or on all five years. A static-β strategy loses money on every pair, mostly through drawdowns in the 2024 DBS re-rating, while the STI ETF gained about 90% over the same period. Friction alone costs about 6–7% of capital over about 25 round trips.

The best variant found, **OCBC/UOB with a rolling hedge**, still has a **Sharpe ratio of −0.50**: it returned +2.4% net (+9.3% gross) over 3.5 years, less than the 3% a year cash would have earned. Two caveats apply before reading anything into it:
- **Data snooping.** It was picked as the best of 6 variants (3 pairs × 2 hedge modes) after seeing the results, so its edge is overstated. A fair test would fix the variant first and run it on new data.
- **Small sample.** Each backtest has only 22–31 round trips (the dashboard flags anything under 30), so the win rate and Sharpe ratio carry wide error bars.

This is an honest negative result, and it is the core lesson of the project: high correlation (ρ ≈ 0.7) is **not** cointegration, and regime shifts break static hedge ratios.

To demo the mechanics on textbook cointegrated data, run `python -m scripts.seed --mode synthetic` and restart the backend. To go back to real data, run `python -m scripts.seed`.

## 6. Four-minute live demo script

| Time | Action | Talking point |
|---|---|---|
| 0:00 | Open the dashboard and point at the header badge | "Data is 5 years of Yahoo Finance adjusted closes, persisted in SQLite and backed by committed CSVs. The demo runs fully offline." |
| 0:30 | **Pair scanner cards** (formation window) | "The verdict comes first: all three pairs are *Not tradeable*. They are about 0.7 correlated in returns, but Engle-Granger rejects cointegration for every one. This test only uses the first 30% of the data, the same window the strategy fits on, so it never peeks at the period we trade. Correlation ≠ cointegration." |
| 1:00 | Click **DBS / UOB**, point at the **Sharpe** card first | "Sharpe −1.65: worse than holding cash. The β is the hedge: how much UOB offsets each S$1 of DBS, in log terms. Note the *small sample* flag: about 25 trades." |
| 1:20 | **Z-score chart** | "We enter at ±2σ (triangles) and exit near zero (rings). The red ✕ marks a stop-loss at 3.5σ, which fires when the relationship breaks." |
| 1:50 | **Normalized price chart**, toggle *log P_A vs β log P_B* | "The gap between these lines *is* the spread. Shaded bands are open positions, and you can see where the gap kept widening in 2024." |
| 2:20 | Click **Toggle Friction** (15 → 0 bps) | "Removing SGX brokerage, clearing and borrow costs lifts returns by about 4–7 points. Friction is first-order for a strategy with this turnover." |
| 2:50 | Switch hedge ratio to **Rolling OLS**, select **OCBC / UOB** | "Our best variant: re-estimating β daily on the past 120 days only. Lead with the Sharpe: still −0.50, so it lost to cash even though it's +2.4% net. And we picked it as the best of six tries after seeing the results, which is data snooping, so treat even that as optimistic." |
| 3:20 | **Trade log**: filter *Stop loss*, then **Export CSV** | "Every trade has its signal date, fill date, board-lot share counts and prices, so a grader can recompute P&L in Excel." |
| 3:45 | Wrap-up | "Formation/trading split, T+1 fills and an automated look-ahead test keep this honest. The finding: SG banks are correlated, but not reliably mean-reverting." |

## 7. Limitations
- Daily closes only. The model has no intraday slippage, borrow availability or recall risk, and no dividend-withholding effects; adjusted closes embed dividends.
- A single cost number (bps per leg) stands in for brokerage, clearing, SGX fees and borrow cost.
- If yfinance is called while the market is open, the last bar may be an intraday price.
- About 25 round trips per backtest is a small sample; results are indicative, not statistically conclusive.
- The best-variant result is subject to data snooping (chosen after comparing 6 variants).

### Deliberate scope cuts (kept in code, hidden or off in the demo UI)
These are tucked into the collapsed **Advanced settings** panel or switched off, so the demo shows only the core levers (pair, entry/exit/stop-loss Z, costs, static vs rolling hedge):
- custom date range, formation split, Z lookback window, starting capital, rolling-OLS window and the T+1 fill toggle;
- live Yahoo Finance sync (`STATARB_ALLOW_SYNC=1` re-enables it);
- the synthetic data generator (`scripts.seed --mode synthetic`).
- This is an educational proof of concept, not investment advice.
