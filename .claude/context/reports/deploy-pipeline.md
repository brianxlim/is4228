# Deploy pipeline report

## Built
- `frontend/next.config.mjs`: `output: "export"` + `images.unoptimized` only when `NEXT_OUTPUT=export`.
- `backend/app/static_site.py`: `mount_frontend(app)` (env `STATARB_STATIC_DIR`, default `backend/static`; no-op without index.html). Lead has wired it in main.py.
- `backend/requirements.txt` (exact pins, "Requires Python 3.11+" header), `backend/requirements.lock` (full pip freeze).
- `Dockerfile` (node:24-alpine build -> python:3.11-slim, non-root uid 10001, HEALTHCHECK via urllib, sh -c CMD on ${PORT:-8080}), `.dockerignore` (also excludes `**/.env.local`, which sets localhost:8000), `docker-compose.yml`, `.github/workflows/ci.yml` (backend / frontend / docker jobs).

## Run locally
- `docker build -t sgx-statarb:local .` then `docker run -p 8080:8080 sgx-statarb:local` (or `docker compose up --build`) -> http://localhost:8080

## Verification
- a. `python -m scripts.verify`: PASS ("All checks passed.")
- b. Export build (`NEXT_OUTPUT=export`): PASS, `frontend/out/index.html` produced ("Exporting (2/2)"). Plain `npm run build`: PASS ("Generating static pages (4/4)"). `out` deleted.
  - Note: an export build on top of a stale non-export `.next` fails with "no direct app page entry found for /_not-found"; clean `.next` fixes it. Docker/CI build from clean, so unaffected.
  - A mid-run tsc error (page.tsx cointegration 4 args) was from another agent's in-progress edit; it resolved itself.
- c. Docker: SKIPPED. Daemon not running; launched Docker Desktop and polled ~5 min, service `com.docker.service` stays Stopped (likely needs manual start/admin). Image size not measured; image never built, so Dockerfile is untested.
- Substitute smoke (no Docker): uvicorn on :8099 with STATARB_STATIC_DIR=frontend/out and main.py's mount_frontend: /api/health 200, /api/cointegration 200 (1752 B JSON), / 200 containing "SGX StatArb" (17.8 KB), POST /api/backtest {} 200. API routes unaffected by the "/" mount.

## Needs attention
- Run `docker build` + smoke test once Docker Desktop is running (or let CI's docker job do it).
- Next 15 telemetry is disabled in the image via NEXT_TELEMETRY_DISABLED.
