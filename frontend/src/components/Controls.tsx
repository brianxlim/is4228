"use client";

import { ChevronDown, RotateCcw, SlidersHorizontal, Zap, ZapOff } from "lucide-react";
import type { BacktestParams } from "@/lib/types";
import { NAMES } from "@/lib/format";

const PAIRS: [string, string][] = [
  ["D05.SI", "O39.SI"],
  ["D05.SI", "U11.SI"],
  ["O39.SI", "U11.SI"],
];

interface Props {
  params: BacktestParams;
  minDate?: string;
  maxDate?: string;
  onChange: (patch: Partial<BacktestParams>) => void;
  onReset: () => void;
}

export default function Controls({ params, minDate, maxDate, onChange, onReset }: Props) {
  const frictionOn = params.transaction_cost_bps > 0;
  return (
    <aside className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
          <SlidersHorizontal size={15} /> Strategy Parameters
        </h2>
        <button onClick={onReset} className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink" title="Reset to defaults">
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <Field label="Pair (A / B)">
        <select
          className="input"
          value={`${params.asset_a}|${params.asset_b}`}
          onChange={(e) => {
            const [a, b] = e.target.value.split("|");
            onChange({ asset_a: a, asset_b: b });
          }}
        >
          {PAIRS.map(([a, b]) => (
            <option key={a + b} value={`${a}|${b}`}>
              {NAMES[a]} / {NAMES[b]} ({a} / {b})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Hedge ratio">
        <select className="input" value={params.hedge_mode}
          onChange={(e) => onChange({ hedge_mode: e.target.value as BacktestParams["hedge_mode"] })}>
          <option value="static">Static OLS (fitted on formation window)</option>
          <option value="rolling">Rolling OLS (re-fitted daily on past data)</option>
        </select>
      </Field>

      <Slider label="Entry |Z|" value={params.entry_z} min={1} max={3} step={0.1}
        display={params.entry_z.toFixed(1)} onChange={(v) => onChange({ entry_z: v })} />
      <Slider label="Exit |Z|" value={params.exit_z} min={0} max={1} step={0.05}
        display={params.exit_z.toFixed(2)} onChange={(v) => onChange({ exit_z: v })} />
      <Slider label="Stop-loss |Z|" value={params.stop_loss_z} min={2.5} max={5} step={0.1}
        display={params.stop_loss_z.toFixed(1)} onChange={(v) => onChange({ stop_loss_z: v })} />

      <Field label="SGX cost per leg (bps)">
        <input type="number" className="input" min={0} max={500} step={1} value={params.transaction_cost_bps}
          onChange={(e) => onChange({ transaction_cost_bps: Math.max(0, Number(e.target.value) || 0) })} />
      </Field>

      <button
        onClick={() => onChange({ transaction_cost_bps: frictionOn ? 0 : 15 })}
        className={`mt-1 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
          frictionOn ? "border-series-2/60 bg-series-2/15 text-ink hover:bg-series-2/25" : "border-line-strong bg-surface-raised hover:bg-surface-hover"
        }`}
      >
        {frictionOn ? <Zap size={15} className="text-series-2" /> : <ZapOff size={15} />}
        Toggle Friction ({frictionOn ? `${params.transaction_cost_bps} bps → 0 bps` : "0 bps → 15 bps"})
      </button>

      {/* Kept for Q&A, collapsed by default so the demo shows only the core levers. */}
      <details className="group mt-4 border-t border-line pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-ink-secondary hover:text-ink">
          Advanced settings
          <ChevronDown size={14} className="transition group-open:rotate-180" />
        </summary>
        <div className="mt-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Start date">
              <input type="date" className="input" min={minDate} max={maxDate} value={params.start_date}
                onChange={(e) => onChange({ start_date: e.target.value })} />
            </Field>
            <Field label="End date">
              <input type="date" className="input" min={minDate} max={maxDate} value={params.end_date}
                onChange={(e) => onChange({ end_date: e.target.value })} />
            </Field>
          </div>
          <Slider label="Formation split (in-sample)" value={params.train_split_ratio} min={0.1} max={0.8} step={0.05}
            display={`${Math.round(params.train_split_ratio * 100)}%`} onChange={(v) => onChange({ train_split_ratio: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Z lookback W (days)">
              <input type="number" className="input" min={5} max={250} value={params.lookback_window}
                onChange={(e) => onChange({ lookback_window: clampInt(e.target.value, 5, 250) })} />
            </Field>
            <Field label="Capital (SGD)">
              <input type="number" className="input" min={10000} step={10000} value={params.initial_capital}
                onChange={(e) => onChange({ initial_capital: Math.max(10000, Number(e.target.value) || 100000) })} />
            </Field>
          </div>
          {params.hedge_mode === "rolling" && (
            <Slider label="Rolling OLS window" value={params.hedge_window} min={40} max={500} step={10}
              display={`${params.hedge_window}d`} onChange={(v) => onChange({ hedge_window: v })} />
          )}
          <label className="flex items-center gap-2 text-xs text-ink-secondary">
            <input type="checkbox" checked={params.execution_lag === 1}
              onChange={(e) => onChange({ execution_lag: e.target.checked ? 1 : 0 })} />
            Fill at next day&apos;s close (T+1 execution, no same-bar bias)
          </label>
        </div>
      </details>
    </aside>
  );
}

function clampInt(v: string, lo: number, hi: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 flex justify-between text-xs">
        <span className="text-ink-muted">{props.label}</span>
        <span className="tabular font-medium">{props.display}</span>
      </span>
      <input type="range" className="w-full" min={props.min} max={props.max} step={props.step} value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))} />
    </label>
  );
}
