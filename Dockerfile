# syntax=docker/dockerfile:1

# ---- Stage 1: build the static frontend ----
FROM node:24-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# No NEXT_PUBLIC_API_URL: production builds call the API on the same origin.
ENV NEXT_OUTPUT=export NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Stage 2: FastAPI runtime serving API + static site ----
FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    STATARB_OFFLINE=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app/backend

COPY backend/requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock

COPY backend/app ./app
COPY backend/scripts ./scripts
COPY backend/data/csv ./data/csv
COPY --from=frontend /frontend/out ./static

RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-c", "import os,urllib.request as u; u.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT','8080'), timeout=4)"]

CMD ["sh", "-c", "uvicorn app.main:app --app-dir /app/backend --host 0.0.0.0 --port ${PORT:-8080}"]
