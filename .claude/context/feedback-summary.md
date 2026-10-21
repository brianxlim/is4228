# Prototype feedback (source: course Google Doc, feedback tab) — read 2026-10-21

Verdict: strong prototype; good for the 60% "functionality & technical soundness" criterion.
Risk = demo-day surprises and gaps between the brief's promises and what's on screen.

## Fixes requested → how handled (branch `feature/prototype-feedback`)
| # | Feedback | Handling |
|---|---|---|
| 1 | Sync button can overwrite committed data and shift demo figures | Sync disabled by default: backend `STATARB_ALLOW_SYNC=1` required (else 403), button hidden unless status says `sync_enabled`; start scripts and container run with `STATARB_OFFLINE=1` |
| 2 | Each pair card needs a clear go/no-go verdict | Cards show TRADEABLE / MARGINAL / NOT TRADEABLE with a one-line reason (EG p-value + half-life) |
| 3 | Trim visible controls to pair, entry/exit/stop, costs, hedge mode | Other controls moved into a collapsed "Advanced" section (kept in code; listed as deliberate cuts) |
| 4 | Pin Python deps to exact versions; check Python version on demo laptops | Exact pins in `backend/requirements.txt`; Python 3.11+ required (numpy 2.4 / pandas 3.0 need it) |

## Q&A weak spots → how handled
| Weak spot | Handling |
|---|---|
| Scanner tests all 5 years, incl. the traded period | Scanner defaults to the formation window (same in-sample split as the backtest); toggle to full range |
| Rolling-hedge "best" variant = data snooping risk | Stated up front in README results + demo script |
| Best result has negative Sharpe (−0.50) | Demo script leads with Sharpe, not +2.4% return |
| ~25 trades is a small sample | UI flags "small sample" when trades < 30; README limitations |
