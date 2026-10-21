import type { BacktestParams, BacktestResult, DataStatus, PairStats, ScanWindow } from "./types";

// Dev: separate API server on :8000. Production build: same origin (FastAPI serves this static export),
// unless NEXT_PUBLIC_API_URL points elsewhere.
const DEFAULT_API = process.env.NODE_ENV === "development" ? "http://localhost:8000" : "";
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || DEFAULT_API).replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* keep status text */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  status: () => request<DataStatus>("/api/data/status"),
  sync: () => request<{ ok: boolean; message: string; status: DataStatus }>("/api/data/sync", { method: "POST" }),
  cointegration: (start: string, end: string, window: ScanWindow, trainSplit: number) => {
    const q = new URLSearchParams({ window, train_split_ratio: String(trainSplit) });
    if (start) q.set("start_date", start);
    if (end) q.set("end_date", end);
    return request<{ pairs: PairStats[]; significance: number; window: ScanWindow }>(`/api/cointegration?${q}`);
  },
  backtest: (params: BacktestParams, signal?: AbortSignal) =>
    request<BacktestResult>("/api/backtest", {
      method: "POST",
      body: JSON.stringify({ ...params, start_date: params.start_date || null, end_date: params.end_date || null }),
      signal,
    }),
};
