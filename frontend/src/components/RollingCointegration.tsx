"use client";

import { useMemo } from "react";
import { Activity } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RollingResult } from "@/lib/types";
import { pct, pval, shortDate } from "@/lib/format";

const COLORS = ["#3987e5", "#d95926", "#199e70"];
const WINDOWS = [120, 250, 500];

interface Props {
  data: RollingResult | null;
  loading: boolean;
  window: number;
  onWindowChange: (w: number) => void;
  activeKey: string;
  error?: string | null;
}

export default function RollingCointegration({ data, loading, window, onWindowChange, activeKey, error }: Props) {
  // One row per date with a column per pair, so the lines share a single x-axis.
  const rows = useMemo(() => {
    if (!data) return [];
    const byDate = new Map<string, Record<string, number | string>>();
    for (const p of data.pairs) {
      for (const pt of p.series) {
        const row = byDate.get(pt.date) ?? { date: pt.date };
        row[p.label] = pt.eg_pvalue;
        byDate.set(pt.date, row);
      }
    }
    return [...byDate.values()].sort((a, b) => (a.date as string).localeCompare(b.date as string));
  }, [data]);

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Activity size={14} /> Cointegration over time
          </h2>
          <p className="text-xs text-ink-muted">
            Engle-Granger p-value re-tested on a trailing window. Below the dashed line (0.05) the pair would have passed
            that day. Each point uses only past data.
          </p>
        </div>
        <div className="flex items-center gap-1 text-xs" role="group" aria-label="Rolling window length">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => onWindowChange(w)}
              className={`rounded-md border px-2 py-1 ${
                w === window ? "border-series-1 bg-surface-raised text-ink" : "border-line text-ink-muted hover:text-ink"
              }`}
            >
              {w} days
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-warn/50 bg-warn/10 p-3 text-xs text-warn">{error}</div>
      ) : !data ? (
        <div className="h-[260px] animate-pulse rounded-lg bg-surface-raised" />
      ) : (
        <>
          <div className={`h-[260px] transition-opacity ${loading ? "opacity-50" : ""}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#2c2c2a" vertical={false} />
                <XAxis dataKey="date" stroke="#383835" tick={{ fill: "#898781", fontSize: 11 }} tickLine={false}
                  tickFormatter={shortDate} minTickGap={48} />
                <YAxis domain={[0, 1]} stroke="#383835" tick={{ fill: "#898781", fontSize: 11 }} tickLine={false} width={36}
                  ticks={[0, 0.05, 0.25, 0.5, 0.75, 1]} />
                <Tooltip
                  contentStyle={{ background: "#1a1a19", border: "1px solid #383835", fontSize: 12 }}
                  labelFormatter={(d: string) => `Window ending ${d}`}
                  formatter={(v: number, name: string) => [pval(v), name]}
                />
                <Legend verticalAlign="top" align="left" height={28} iconType="plainline" iconSize={14}
                  formatter={(v: string) => <span style={{ color: "#c3c2b7", fontSize: 12 }}>{v}</span>} />
                <ReferenceLine y={data.significance} stroke="#d03b3b" strokeDasharray="5 4"
                  label={{ value: "p = 0.05", fill: "#d03b3b", fontSize: 11, position: "insideTopRight" }} />
                {data.pairs.map((p, i) => {
                  const active = `${p.asset_a}|${p.asset_b}` === activeKey;
                  return (
                    <Line key={p.label} type="monotone" dataKey={p.label} stroke={COLORS[i % COLORS.length]}
                      strokeWidth={active ? 2.5 : 1.25} strokeOpacity={active ? 1 : 0.6} dot={false} isAnimationActive={false} />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {data.pairs.map((p, i) => (
              <div key={p.label} className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-xs">
                <div className="flex items-center gap-1.5 font-medium text-ink">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  {p.label}
                </div>
                <div className="mt-0.5 text-ink-secondary">
                  Passed in <b className="text-ink">{pct(p.summary.pct_cointegrated, 0)}</b> of {p.summary.windows} windows
                </div>
                <div className="text-ink-muted">
                  Best p {pval(p.summary.best_pvalue)} ({p.summary.best_date}) · latest {pval(p.summary.latest_pvalue)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
