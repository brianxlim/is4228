"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Info, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import PairScanner from "@/components/PairScanner";
import Controls from "@/components/Controls";
import KpiRibbon from "@/components/KpiRibbon";
import Charts from "@/components/Charts";
import TradeLog from "@/components/TradeLog";
import { api, API_URL } from "@/lib/api";
import type { BacktestParams, BacktestResult, DataStatus, PairStats } from "@/lib/types";

const DEFAULTS: BacktestParams = {
  asset_a: "D05.SI",
  asset_b: "O39.SI",
  start_date: "",
  end_date: "",
  train_split_ratio: 0.3,
  lookback_window: 30,
  entry_z: 2.0,
  exit_z: 0.2,
  stop_loss_z: 3.5,
  initial_capital: 100000,
  transaction_cost_bps: 15,
  hedge_mode: "static",
  hedge_window: 120,
  execution_lag: 1,
};

export default function Home() {
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [pairs, setPairs] = useState<PairStats[] | null>(null);
  const [coLoading, setCoLoading] = useState(false);
  const [params, setParams] = useState<BacktestParams>(DEFAULTS);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const minDate = status?.coverage?.[0]?.start;
  const maxDate = status?.coverage?.[0]?.end;

  // Data status -> default the date pickers to the full stored range.
  useEffect(() => {
    api
      .status()
      .then((s) => {
        setStatus(s);
        const c = s.coverage[0];
        if (c) setParams((p) => ({ ...p, start_date: p.start_date || c.start, end_date: p.end_date || c.end }));
      })
      .catch((e: Error) => setError(`Cannot reach API at ${API_URL} — is the backend running? (${e.message})`));
  }, [dataVersion]);

  // Cointegration scan follows the selected date range.
  useEffect(() => {
    if (!params.start_date || !params.end_date) return;
    setCoLoading(true);
    const t = setTimeout(() => {
      api
        .cointegration(params.start_date, params.end_date)
        .then((r) => setPairs(r.pairs))
        .catch(() => setPairs(null))
        .finally(() => setCoLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [params.start_date, params.end_date, dataVersion]);

  // Debounced backtest on any parameter change.
  useEffect(() => {
    if (!params.start_date || !params.end_date) return;
    const t = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setRunning(true);
      api
        .backtest(params, ctrl.signal)
        .then((r) => {
          setResult(r);
          setError(null);
        })
        .catch((e: Error) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (abortRef.current === ctrl) setRunning(false);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [params, dataVersion]);

  const onChange = useCallback((patch: Partial<BacktestParams>) => setParams((p) => ({ ...p, ...patch })), []);

  const onSync = async () => {
    setSyncing(true);
    try {
      const r = await api.sync();
      setStatus(r.status);
      setToast({ ok: r.ok, msg: r.message });
      if (r.ok) setDataVersion((v) => v + 1);
    } catch (e) {
      setToast({ ok: false, msg: (e as Error).message });
    } finally {
      setSyncing(false);
      setTimeout(() => setToast(null), 6000);
    }
  };

  return (
    <>
      <Header status={status} syncing={syncing} onSync={onSync} />
      {toast && (
        <div
          className={`fixed right-4 top-20 z-30 max-w-md rounded-lg border px-4 py-3 text-sm shadow-xl ${
            toast.ok ? "border-good/50 bg-surface-raised" : "border-warn/50 bg-surface-raised"
          }`}
        >
          <span className={toast.ok ? "text-good" : "text-warn"}>{toast.ok ? "✓ " : "⚠ "}</span>
          {toast.msg}
        </div>
      )}

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4 md:px-6">
        <PairScanner
          pairs={pairs}
          loading={coLoading}
          activeKey={`${params.asset_a}|${params.asset_b}`}
          onSelect={(a, b) => onChange({ asset_a: a, asset_b: b })}
        />

        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-[76px] lg:self-start">
            <Controls params={params} minDate={minDate} maxDate={maxDate} onChange={onChange} onReset={() =>
              setParams({ ...DEFAULTS, start_date: minDate ?? "", end_date: maxDate ?? "" })} />
            {result && (
              <div className="mt-3 rounded-xl border border-line bg-surface p-3 text-xs text-ink-secondary">
                <div className="mb-1 flex items-center gap-1.5 font-medium text-ink">
                  <Info size={13} /> Out-of-sample design
                </div>
                Formation: first {result.formation.formation_bars} bars ({result.formation.start_date} → {result.formation.end_date}) estimate α, β.
                Trading: {result.formation.trading_bars} bars from {result.formation.trading_start}.
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-critical/50 bg-critical/10 p-3 text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-critical" />
                <span>{error}</span>
              </div>
            )}
            <div className="relative">
              <KpiRibbon result={result} />
              {running && (
                <div className="absolute -top-6 right-0 flex items-center gap-1 text-xs text-ink-muted">
                  <Loader2 size={12} className="animate-spin" /> running backtest…
                </div>
              )}
            </div>
            {result ? (
              <>
                <Charts result={result} />
                <TradeLog result={result} />
              </>
            ) : (
              !error && <div className="h-[600px] animate-pulse rounded-xl border border-line bg-surface" />
            )}
          </div>
        </div>
        <footer className="pb-6 pt-2 text-center text-[11px] text-ink-muted">
          Educational proof-of-concept · not investment advice · daily adjusted closes via {status?.origin === "synthetic_calibrated" ? "synthetic calibrated seed" : "Yahoo Finance"}, persisted in SQLite + CSV
        </footer>
      </main>
    </>
  );
}
