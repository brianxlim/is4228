#!/usr/bin/env bash
# Start FastAPI (:8000) and Next.js (:3000) together. Ctrl+C stops both.
set -euo pipefail
cd "$(dirname "$0")"

if [ -x backend/.venv/bin/python ]; then PY=backend/.venv/bin/python
elif [ -x backend/.venv/Scripts/python.exe ]; then PY=backend/.venv/Scripts/python.exe
else echo "Run 'make install' first"; exit 1; fi

[ -d frontend/node_modules ] || (cd frontend && npm install)
[ -f frontend/.env.local ] || echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > frontend/.env.local

# Demo-safe: never touch the network; data comes from the committed CSVs.
STATARB_OFFLINE=1 "$PY" -m uvicorn app.main:app --app-dir backend --port 8000 &
BACK=$!
(cd frontend && npm run dev) &
FRONT=$!
trap 'kill $BACK $FRONT 2>/dev/null' INT TERM EXIT

echo "Backend  -> http://localhost:8000/docs"
echo "Frontend -> http://localhost:3000"
wait
