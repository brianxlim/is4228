"use client";

import { AlertTriangle, CheckCircle2, ChevronRight, XCircle } from "lucide-react";
import type { PairStats, ScanWindow, Verdict } from "@/lib/types";
import { num, pval } from "@/lib/format";

interface Props {
  pairs: PairStats[] | null;
  activeKey: string;
  loading: boolean;
  window: ScanWindow;
  trainSplit: number;
  onWindowChange: (w: ScanWindow) => void;
  onSelect: (a: string, b: string) => void;
}

const VERDICT: Record<Verdict, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  TRADEABLE: { label: "Tradeable", className: "bg-good/15 text-good", Icon: CheckCircle2 },
  MARGINAL: { label: "Marginal", className: "bg-warn/15 text-warn", Icon: AlertTriangle },
  NOT_TRADEABLE: { label: "Not tradeable", className: "bg-critical/15 text-critical", Icon: XCircle },
};

export default function PairScanner({ pairs, activeKey, loading, window, trainSplit, onWindowChange, onSelect }: Props) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">Pair Cointegration Scanner</h2>
          <p className="text-xs text-ink-muted">
            Go / no-go verdict per pair: cointegrated at 5% (Engle-Granger) and a spread half-life ≤ 60 trading days. Click a card to backtest.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-ink-muted">Tested on</span>
          <div className="flex rounded-lg border border-line-strong p-0.5">
            {(["formation", "full"] as const).map((w) => (
              <button
                key={w}
                onClick={() => onWindowChange(w)}
                className={`rounded-md px-2 py-1 ${window === w ? "bg-surface-hover text-ink" : "text-ink-muted hover:text-ink"}`}
                title={w === "formation" ? "Only the in-sample period the backtest fits on — no peeking at the traded period" : "Whole selected date range"}
              >
                {w === "formation" ? `Formation window (first ${Math.round(trainSplit * 100)}%)` : "Full range"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {(pairs ?? [null, null, null]).map((p, i) =>
          p ? (
            <PairCard key={`${p.asset_a}-${p.asset_b}`} p={p} active={activeKey === `${p.asset_a}|${p.asset_b}`} onSelect={onSelect} />
          ) : (
            <div key={i} className="h-[164px] animate-pulse rounded-xl border border-line bg-surface" />
          ),
        )}
      </div>
      {loading && pairs && <p className="mt-1 text-xs text-ink-muted">Recomputing…</p>}
    </section>
  );
}

function PairCard({ p, active, onSelect }: { p: PairStats; active: boolean; onSelect: (a: string, b: string) => void }) {
  const v = VERDICT[p.verdict];
  return (
    <button
      onClick={() => onSelect(p.asset_a, p.asset_b)}
      className={`group rounded-xl border bg-surface p-4 text-left transition hover:bg-surface-raised ${
        active ? "border-series-1 ring-1 ring-series-1/50" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-ink-muted">{p.asset_a} / {p.asset_b} · {p.start_date} → {p.end_date}</div>
          <div className="text-lg font-semibold">{p.label}</div>
        </div>
        <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold ${v.className}`}>
          <v.Icon size={15} /> {v.label}
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-secondary">{p.verdict_reason}</p>
      <dl className="tabular mt-3 grid grid-cols-4 gap-2 text-sm">
        <Stat label="EG p-value" value={pval(p.eg_pvalue)} />
        <Stat label="Half-life" value={p.half_life_days ? `${num(p.half_life_days, 1)}d` : "∞"} />
        <Stat label="Hedge β" value={num(p.beta, 3)} />
        <Stat label="ρ (returns)" value={num(p.correlation, 2)} />
      </dl>
      <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
        <span>ADF stat {num(p.adf_stat, 2)} (p {pval(p.adf_pvalue)}) · n={p.n_obs} days</span>
        <ChevronRight size={14} className="opacity-0 transition group-hover:opacity-100" />
      </div>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-ink-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
