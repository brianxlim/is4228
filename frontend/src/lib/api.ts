import type { BacktestParams, BacktestResult, DataStatus, PairStats } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

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
  cointegration: (start?: string, end?: string) => {
    const q = new URLSearchParams();
    if (start) q.set("start_date", start);
    if (end) q.set("end_date", end);
    return request<{ pairs: PairStats[]; significance: number }>(`/api/cointegration?${q}`);
  },
  backtest: (params: BacktestParams, signal?: AbortSignal) =>
    request<BacktestResult>("/api/backtest", {
      method: "POST",
      body: JSON.stringify({ ...params, start_date: params.start_date || null, end_date: params.end_date || null }),
      signal,
    }),
};
