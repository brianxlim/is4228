"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import type { BacktestResult, TsRow } from "@/lib/types";
import { num, shortDate } from "@/lib/format";

const C = {
  s1: "#3987e5",
  s2: "#d95926",
  s3: "#199e70",
  s4: "#c98500",
  grid: "#2c2c2a",
  axis: "#383835",
  muted: "#898781",
  ink: "#f0efec",
  ink2: "#c3c2b7",
  surface: "#1a1a19",
  critical: "#d03b3b",
};
const SYNC = "backtest";

const axisProps = {
  stroke: C.axis,
  tick: { fill: C.muted, fontSize: 11 },
  tickLine: false,
} as const;

function xAxis() {
  return <XAxis dataKey="date" {...axisProps} tickFormatter={shortDate} minTickGap={48} />;
}

function legend() {
  return (
    <Legend
      verticalAlign="top"
      align="left"
      height={28}
      iconType="plainline"
      iconSize={14}
      wrapperStyle={{ fontSize: 12 }}
      formatter={(v: string) => <span style={{ color: C.ink2 }}>{v}</span>}
    />
  );
}

function makeTooltip(fmt: (key: string, v: number) => string, extra?: (row: Row) => React.ReactNode) {
  return function Tip({ active, payload, label }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as Row;
    const items = payload.filter((p) => p.value !== null && p.value !== undefined && !String(p.dataKey).startsWith("m_"));
    return (
      <div className="rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-xs shadow-xl">
        <div className="mb-1 font-medium text-ink">{label}</div>
        {items.map((p) => (
          <div key={String(p.dataKey)} className="tabular flex items-center gap-2">
            <span className="inline-block h-0.5 w-3" style={{ background: p.color }} />
            <span className="text-ink-secondary">{p.name}</span>
            <span className="ml-auto pl-3 font-medium text-ink">{fmt(String(p.dataKey), Number(p.value))}</span>
          </div>
        ))}
        {extra?.(row)}
      </div>
    );
  };
}

type Row = TsRow & {
  m_long?: number | null;
  m_short?: number | null;
  m_exit?: number | null;
  m_stop?: number | null;
};

function ChartCard({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-ink-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

// Marker shapes: triangles for entries, ring for mean-reversion exits, X for stop-loss.
function marker(kind: "long" | "short" | "exit" | "stop") {
  // eslint-disable-next-line react/display-name
  return (props: { cx?: number; cy?: number; index?: number; value?: number | null }) => {
    const { cx, cy, index } = props;
    if (cx === undefined || cy === undefined || props.value === null || props.value === undefined || !Number.isFinite(cy)) {
      return <g key={`${kind}-${index}`} />;
    }
    const k = `${kind}-${index}`;
    if (kind === "long")
      return <path key={k} d={`M${cx},${cy - 7} L${cx + 6},${cy + 5} L${cx - 6},${cy + 5} Z`} fill={C.s1} stroke={C.surface} strokeWidth={2} />;
    if (kind === "short")
      return <path key={k} d={`M${cx},${cy + 7} L${cx + 6},${cy - 5} L${cx - 6},${cy - 5} Z`} fill={C.s2} stroke={C.surface} strokeWidth={2} />;
    if (kind === "exit") return <circle key={k} cx={cx} cy={cy} r={5} fill={C.surface} stroke={C.ink} strokeWidth={2} />;
    return (
      <g key={k} stroke={C.critical} strokeWidth={2.5}>
        <line x1={cx - 5} y1={cy - 5} x2={cx + 5} y2={cy + 5} />
        <line x1={cx - 5} y1={cy + 5} x2={cx + 5} y2={cy - 5} />
      </g>
    );
  };
}

export default function Charts({ result }: { result: BacktestResult }) {
  const { timeseries, trades, params, labels, formation } = result;
  const [priceView, setPriceView] = useState<"log" | "norm">("log");

  const rows: Row[] = useMemo(() => {
    const byDate = new Map<string, Row>(timeseries.map((r) => [r.date, { ...r }]));
    for (const t of trades) {
      const e = byDate.get(t.entry_date);
      if (e) {
        if (t.direction === "LONG_SPREAD") e.m_long = e.zscore;
        else e.m_short = e.zscore;
      }
      const x = byDate.get(t.exit_date);
      if (x && t.exit_reason !== "END_OF_PERIOD") {
        if (t.exit_reason === "STOP_LOSS") x.m_stop = x.zscore;
        else x.m_exit = x.zscore;
      }
    }
    return Array.from(byDate.values());
  }, [timeseries, trades]);

  const zExtent = useMemo(() => {
    const zs = timeseries.map((r) => r.zscore).filter((z): z is number => z !== null);
    const lo = Math.min(-params.stop_loss_z - 0.5, ...zs);
    const hi = Math.max(params.stop_loss_z + 0.5, ...zs);
    return [Math.floor(lo), Math.ceil(hi)];
  }, [timeseries, params.stop_loss_z]);

  const A = labels.asset_a;
  const B = labels.asset_b;

  const zTip = useMemo(
    () =>
      makeTooltip(
        (_, v) => num(v, 2),
        (r) => (
          <div className="mt-1 border-t border-line pt-1 text-ink-muted">
            Position: {r.signal === 1 ? "Long spread" : r.signal === -1 ? "Short spread" : "Flat"}
          </div>
        ),
      ),
    [],
  );
  const eqTip = useMemo(() => makeTooltip((_, v) => `S$${num(v, 0)}`), []);
  const ddTip = useMemo(() => makeTooltip((_, v) => `${num(v, 2)}%`), []);
  const pxTip = useMemo(
    () =>
      makeTooltip(
        (_, v) => num(v, priceView === "log" ? 4 : 2),
        (r) => (
          <div className="mt-1 border-t border-line pt-1 text-ink-muted">
            {A} S${num(r.price_a, 2)} · {B} S${num(r.price_b, 2)}
          </div>
        ),
      ),
    [priceView, A, B],
  );

  return (
    <div className="space-y-4">
      <ChartCard
        title="Z-Score & Signal Triggers"
        subtitle={`Rolling ${params.lookback_window}-day Z of spread = log ${A} − (α + β·log ${B}) · trading window ${formation.trading_start} → ${formation.trading_end}`}
        right={
          <div className="flex flex-wrap gap-3 text-[11px] text-ink-secondary">
            <LegendGlyph shape="up" color={C.s1} label="Long spread entry" />
            <LegendGlyph shape="down" color={C.s2} label="Short spread entry" />
            <LegendGlyph shape="ring" color={C.ink} label="Mean-reversion exit" />
            <LegendGlyph shape="x" color={C.critical} label="Stop-loss exit" />
          </div>
        }
      >
        <div className="h-[280px]">
          <ResponsiveContainer>
            <ComposedChart data={rows} syncId={SYNC} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              {xAxis()}
              <YAxis {...axisProps} domain={zExtent} allowDecimals={false} width={36} />
              <Tooltip content={zTip} />
              <ReferenceLine y={0} stroke={C.muted} />
              <ReferenceLine y={params.entry_z} stroke={C.s2} strokeDasharray="5 4" label={lbl(`+${params.entry_z} entry`)} />
              <ReferenceLine y={-params.entry_z} stroke={C.s1} strokeDasharray="5 4" label={lbl(`−${params.entry_z} entry`)} />
              <ReferenceLine y={params.stop_loss_z} stroke={C.critical} strokeDasharray="2 4" label={lbl(`+${params.stop_loss_z} stop`)} />
              <ReferenceLine y={-params.stop_loss_z} stroke={C.critical} strokeDasharray="2 4" label={lbl(`−${params.stop_loss_z} stop`)} />
              {params.exit_z > 0 && (
                <ReferenceArea y1={-params.exit_z} y2={params.exit_z} fill={C.muted} fillOpacity={0.08} />
              )}
              <Line type="linear" dataKey="zscore" name="Z-score" stroke={C.ink2} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line dataKey="m_long" name="Long entry" stroke="none" dot={marker("long")} activeDot={false} isAnimationActive={false} legendType="none" />
              <Line dataKey="m_short" name="Short entry" stroke="none" dot={marker("short")} activeDot={false} isAnimationActive={false} legendType="none" />
              <Line dataKey="m_exit" name="Exit" stroke="none" dot={marker("exit")} activeDot={false} isAnimationActive={false} legendType="none" />
              <Line dataKey="m_stop" name="Stop" stroke="none" dot={marker("stop")} activeDot={false} isAnimationActive={false} legendType="none" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="Equity Curve & Underwater Drawdown"
        subtitle={`Initial capital S$${num(params.initial_capital, 0)} · ${params.transaction_cost_bps} bps per leg · STI ETF buy-and-hold benchmark`}
      >
        <div className="h-[250px]">
          <ResponsiveContainer>
            <LineChart data={rows} syncId={SYNC} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              {legend()}
              <CartesianGrid stroke={C.grid} vertical={false} />
              {xAxis()}
              <YAxis {...axisProps} width={56} domain={["auto", "auto"]} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <Tooltip content={eqTip} />
              <ReferenceLine y={params.initial_capital} stroke={C.axis} />
              <Line dataKey="equity" name="Strategy (net of fees)" stroke={C.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="gross_equity" name="Strategy (gross)" stroke={C.s3} strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
              <Line dataKey="benchmark" name="STI ETF (ES3)" stroke={C.s2} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="h-[120px]">
          <ResponsiveContainer>
            <AreaChart data={rows} syncId={SYNC} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              {xAxis()}
              <YAxis {...axisProps} width={56} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
              <Tooltip content={ddTip} />
              <Area dataKey="drawdown_pct" name="Drawdown (net)" stroke={C.s1} strokeWidth={1.5} fill={C.s1} fillOpacity={0.25} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="Normalized Price Convergence"
        subtitle={
          priceView === "log"
            ? `log ${A} vs α + β·log ${B} (β ${num(formation.beta, 3)}${params.hedge_mode === "rolling" ? ", rolling" : ""}) — the gap is the traded spread; shaded = position open`
            : `${A} and ${B} rebased to 100 at start of trading window; shaded = position open`
        }
        right={
          <div className="flex rounded-lg border border-line-strong p-0.5 text-xs">
            {(["log", "norm"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setPriceView(v)}
                className={`rounded-md px-2 py-1 ${priceView === v ? "bg-surface-hover text-ink" : "text-ink-muted hover:text-ink"}`}
              >
                {v === "log" ? "log P_A vs β·log P_B" : "Rebased = 100"}
              </button>
            ))}
          </div>
        }
      >
        <div className="h-[280px]">
          <ResponsiveContainer>
            <LineChart data={rows} syncId={SYNC} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              {legend()}
              <CartesianGrid stroke={C.grid} vertical={false} />
              {xAxis()}
              <YAxis {...axisProps} width={48} domain={["auto", "auto"]} tickFormatter={(v: number) => (priceView === "log" ? v.toFixed(2) : v.toFixed(0))} />
              <Tooltip content={pxTip} />
              {trades.map((t) => (
                <ReferenceArea
                  key={t.trade_id}
                  x1={t.entry_date}
                  x2={t.exit_date}
                  fill={t.direction === "LONG_SPREAD" ? C.s1 : C.s2}
                  fillOpacity={0.08}
                  ifOverflow="extendDomain"
                />
              ))}
              {priceView === "log" ? (
                <>
                  <Line dataKey="log_a" name={`log ${A}`} stroke={C.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="hedged_log_b" name={`α + β·log ${B}`} stroke={C.s2} strokeWidth={2} dot={false} isAnimationActive={false} />
                </>
              ) : (
                <>
                  <Line dataKey="norm_a" name={`${A} (=100)`} stroke={C.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="norm_b" name={`${B} (=100)`} stroke={C.s2} strokeWidth={2} dot={false} isAnimationActive={false} />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}

function lbl(text: string) {
  return { value: text, position: "insideTopRight" as const, fill: C.muted, fontSize: 10 };
}

function LegendGlyph({ shape, color, label }: { shape: "up" | "down" | "ring" | "x"; color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <svg width="12" height="12" viewBox="-6 -6 12 12">
        {shape === "up" && <path d="M0,-5 L5,4 L-5,4 Z" fill={color} />}
        {shape === "down" && <path d="M0,5 L5,-4 L-5,-4 Z" fill={color} />}
        {shape === "ring" && <circle r={4} fill="none" stroke={color} strokeWidth={2} />}
        {shape === "x" && (
          <g stroke={color} strokeWidth={2}>
            <line x1={-4} y1={-4} x2={4} y2={4} />
            <line x1={-4} y1={4} x2={4} y2={-4} />
          </g>
        )}
      </svg>
      {label}
    </span>
  );
}
