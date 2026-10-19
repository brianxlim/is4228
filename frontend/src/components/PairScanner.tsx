"use client";

import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import type { PairStats } from "@/lib/types";
import { num, pval } from "@/lib/format";

interface Props {
  pairs: PairStats[] | null;
  activeKey: string;
  loading: boolean;
  onSelect: (a: string, b: string) => void;
}

export default function PairScanner({ pairs, activeKey, loading, onSelect }: Props) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">Pair Cointegration Scanner</h2>
        <span className="text-xs text-ink-muted">Engle-Granger on log prices over selected range · click a card to backtest</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {(pairs ?? [null, null, null]).map((p, i) =>
          p ? (
            <PairCard key={`${p.asset_a}-${p.asset_b}`} p={p} active={activeKey === `${p.asset_a}|${p.asset_b}`} onSelect={onSelect} />
          ) : (
            <div key={i} className="h-[148px] animate-pulse rounded-xl border border-line bg-surface" />
          ),
        )}
      </div>
      {loading && pairs && <p className="mt-1 text-xs text-ink-muted">Recomputing…</p>}
    </section>
  );
}

function PairCard({ p, active, onSelect }: { p: PairStats; active: boolean; onSelect: (a: string, b: string) => void }) {
  return (
    <button
      onClick={() => onSelect(p.asset_a, p.asset_b)}
      className={`group rounded-xl border bg-surface p-4 text-left transition hover:bg-surface-raised ${
        active ? "border-series-1 ring-1 ring-series-1/50" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-ink-muted">#{p.rank} · {p.asset_a} / {p.asset_b}</div>
          <div className="text-lg font-semibold">{p.label}</div>
        </div>
        {p.is_cointegrated ? (
          <span className="flex items-center gap-1 rounded-full bg-good/15 px-2 py-0.5 text-xs font-medium text-good">
            <CheckCircle2 size={13} /> Cointegrated (p &lt; 0.05)
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">
            <AlertTriangle size={13} /> Weak Stationary
          </span>
        )}
      </div>
      <dl className="tabular mt-3 grid grid-cols-4 gap-2 text-sm">
        <Stat label="EG p-value" value={pval(p.eg_pvalue)} />
        <Stat label="ADF p (resid)" value={pval(p.adf_pvalue)} />
        <Stat label="Hedge β" value={num(p.beta, 3)} />
        <Stat label="Half-life" value={p.half_life_days ? `${num(p.half_life_days, 1)}d` : "∞"} />
      </dl>
      <div className="mt-2 flex items-center justify-between text-xs text-ink-muted">
        <span>
          ρ(returns) {num(p.correlation, 2)} · ADF stat {num(p.adf_stat, 2)} · n={p.n_obs}
        </span>
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
