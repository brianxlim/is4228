# Decisions log

## 2026-10-21 — prototype feedback iteration (`feature/prototype-feedback`)
- **Deployment shape: one container.** The dashboard is fully client-side, so Next.js is static-exported and served by FastAPI from the same origin (`/api/*` + static files). One Cloud Run service, no CORS, one URL. Local dev still runs two servers (Next dev on :3000, API on :8000).
- **Target host: Google Cloud Run** (gcloud SDK already installed on the dev machine). Actual deploy only into the user's configured project; see `reports/`.
- **Data is frozen for the demo.** Live yfinance sync is off unless `STATARB_ALLOW_SYNC=1`; the container and start scripts set `STATARB_OFFLINE=1`. Committed CSVs (Yahoo data 2021-10-18 → 2026-10-19) are the single source of truth.
- **Scanner defaults to the formation window** to remove the "tested on the traded period" critique.
- **Python 3.11+ is required** by the pinned numpy/pandas versions.
- **Pair verdict rule** (`backend/app/quant/stats.py::tradeability`): TRADEABLE = EG p < 0.05 and half-life ≤ 60 trading days; MARGINAL = p < 0.05 with a slow half-life, or 0.05 ≤ p < 0.10; else NOT_TRADEABLE. On the real data all 3 pairs are NOT_TRADEABLE in both windows.
- **Controls trimmed**: visible = pair, hedge mode, entry/exit/stop Z, cost bps + friction toggle. Dates, formation split, Z lookback, capital, rolling window, T+1 toggle live in a collapsed "Advanced settings" `<details>`.
- **Small-sample flag** under 30 trades on the Win Rate KPI.
- **Deploy pipeline** (Sonnet subagent, report in `reports/deploy-pipeline.md`): multi-stage `Dockerfile` (node:24-alpine export → python:3.11-slim, non-root, `STATARB_OFFLINE=1`), `docker-compose.yml`, `.github/workflows/ci.yml`, `backend/app/static_site.py` (mounted last in main.py), exact pins + `requirements.lock`. Export build is gated by `NEXT_OUTPUT=export` in `next.config.mjs`.
- **API base URL**: `frontend/src/lib/api.ts` defaults to `http://localhost:8000` only when `NODE_ENV=development`; production builds use the same origin. (PowerShell `$env:X=""` deletes X, so relying on an empty `NEXT_PUBLIC_API_URL` was fragile.) Verified: production export served by uvicorn on one port (launch config `prod-single-port`, needs `frontend/out` copied to `backend/static`) loads all data via same-origin `/api/*`.
- **Not yet verified:** the Docker image itself. Docker Desktop's service wouldn't start without admin; CI's `docker` job is the first real build. Lockfiles were checked for Linux/musl portability (OK).
- **Cloud Run deploy blocked on the user:** gcloud token expired (`invalid_grant`) and the configured project is `lounge-bookings` (probably unrelated). Once they `gcloud auth login`, run `deploy/cloudrun.ps1 -Project <id>`. Gotcha: an export build over a stale non-export `.next` fails ("no direct app page entry for /_not-found") — delete `.next` first.

## 2026-10-19/20 — initial build (pre-git history)
- Next 15.5 + React 19 + Tailwind 4 + recharts 2.15 (needs `react-is` override) after npm audit; Node ≥ 20 required.
- PowerShell 5.1 `Set-Content`/`Out-File` add BOMs and can mangle UTF-8 — write files with the editor tools or `[IO.File]::WriteAllText` with UTF8Encoding($false).
