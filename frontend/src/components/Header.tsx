"use client";

import { Activity, Database, RefreshCw } from "lucide-react";
import type { DataStatus } from "@/lib/types";

interface Props {
  status: DataStatus | null;
  syncing: boolean;
  onSync: () => void;
}

export default function Header({ status, syncing, onSync }: Props) {
  const live = status?.source === "yfinance_live";
  const synthetic = status?.origin === "synthetic_calibrated";
  const cov = status?.coverage?.[0];

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-page/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-series-1/15 text-series-1">
            <Activity size={20} />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight md:text-lg">
              SGX StatArb Engine
              <span className="hidden font-normal text-ink-secondary sm:inline"> — Pairs Trading &amp; Cointegration PoC</span>
            </h1>
            <p className="text-xs text-ink-muted">DBS · OCBC · UOB vs STI ETF (ES3) · daily adjusted closes</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {status && (
            <div
              className="flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs"
              title={`${status.total_rows.toLocaleString()} rows in ${status.database}${status.note ? ` — ${status.note}` : ""}`}
            >
              <Database size={14} className={live ? "text-good" : "text-series-1"} />
              <span className="font-medium">{live ? "SQLite + Yahoo Finance Live" : "SQLite + Local CSV Verified"}</span>
              <span className="hidden text-ink-muted xl:inline">
                · {synthetic ? "synthetic calibrated seed" : "Yahoo Finance data"}
                {cov ? ` · ${cov.start} → ${cov.end}` : ""}
              </span>
            </div>
          )}
          {/* Hidden unless the API runs with STATARB_ALLOW_SYNC=1, so a demo click can't change the dataset. */}
          {status?.sync_enabled && (
            <button
              onClick={onSync}
              disabled={syncing}
              className="flex items-center gap-2 rounded-lg border border-line-strong bg-surface-raised px-3 py-1.5 text-sm font-medium hover:bg-surface-hover disabled:opacity-60"
            >
              <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing…" : "Sync Yahoo Finance"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
