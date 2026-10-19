# macOS / Linux convenience targets. On Windows use .\start.ps1
PY      := backend/.venv/bin/python
PIP     := backend/.venv/bin/pip

.PHONY: install seed seed-synthetic verify backend frontend dev build

install:
	python3 -m venv backend/.venv
	$(PIP) install -r backend/requirements.txt
	cd frontend && npm install
	@test -f frontend/.env.local || echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > frontend/.env.local

seed:            ## fetch 5y from yfinance, fall back to synthetic
	cd backend && ../$(PY) -m scripts.seed

seed-synthetic:  ## deterministic offline dataset
	cd backend && ../$(PY) -m scripts.seed --mode synthetic

verify:
	cd backend && ../$(PY) -m scripts.verify

backend:
	$(PY) -m uvicorn app.main:app --app-dir backend --port 8000 --reload

frontend:
	cd frontend && npm run dev

dev:
	./start.sh

build:
	cd frontend && npm run build
