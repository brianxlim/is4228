"use client";

import { Coins, Gauge, Percent, Sigma, TrendingDown, TrendingUp } from "lucide-react";
import type { BacktestResult } from "@/lib/types";
import { num, pct, pval, sgd } from "@/lib/format";

export default function KpiRibbon({ result }: { result: BacktestResult | null }) {
  const m = result?.metrics;
  const f = result?.formation;
  const b = result?.benchmark_metrics;

  const cards = [
    {
      icon: Gauge,
      label: "Annualized Sharpe",
      value: num(m?.sharpe_ratio, 2),
      sub: m ? `Sortino ${num(m.sortino_ratio, 2)} · rf ${num(m.risk_free_rate_pct, 1)}% SORA` : "",
      tone: tone(m?.sharpe_ratio),
    },
    {
      icon: TrendingDown,
      label: "Max Drawdown",
      value: pct(m?.max_drawdown_pct, 2),
      sub: m ? `Ann. vol ${pct(m.annual_volatility_pct, 1)} · STI ${pct(b?.max_drawdown_pct, 1)}` : "",
      tone: "neutral" as const,
    },
    {
      icon: TrendingUp,
      label: "Cumulative Net Return",
      value: pct(m?.total_return_pct, 2, true),
      sub: m ? `Gross ${pct(m.gross_total_return_pct, 2, true)} · STI ${pct(b?.total_return_pct, 1, true)}` : "",
      tone: tone(m?.total_return_pct),
    },
    {
      icon: Percent,
      label: "Win Rate",
      value: pct(m?.win_rate_pct, 1),
      sub: m ? `${m.total_trades} trades · PF ${num(m.profit_factor, 2)} · ${num(m.avg_holding_days, 1)}d avg` : "",
      tone: "neutral" as const,
    },
    {
      icon: Sigma,
      label: "ADF p-value & Half-Life",
      value: f ? `${pval(f.eg_pvalue)} · ${f.half_life_days ? `${num(f.half_life_days, 1)}d` : "∞"}` : "—",
      sub: f ? `Formation EG test · β ${num(f.beta, 3)} · ADF p ${pval(f.adf_pvalue)}` : "",
      tone: f ? (f.is_cointegrated ? ("good" as const) : ("warn" as const)) : ("neutral" as const),
    },
    {
      icon: Coins,
      label: "Total Fees Drag",
      value: sgd(m?.total_fees_sgd, 0),
      sub: m ? `${num(result!.params.transaction_cost_bps, 0)} bps/leg · ${pct((m.total_fees_sgd / result!.params.initial_capital) * 100, 2)} of capital` : "",
      tone: "neutral" as const,
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-line bg-surface p-3">
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <c.icon size={13} /> {c.label}
          </div>
          <div
            className={`mt-1 text-2xl font-semibold ${
              c.tone === "good" ? "text-good" : c.tone === "bad" ? "text-critical" : c.tone === "warn" ? "text-warn" : "text-ink"
            }`}
          >
            {m ? c.value : <span className="inline-block h-7 w-20 animate-pulse rounded bg-surface-raised" />}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-ink-muted" title={c.sub}>
            {c.sub}
          </div>
        </div>
      ))}
    </section>
  );
}

function tone(v: number | null | undefined): "good" | "bad" | "neutral" {
  if (v === null || v === undefined) return "neutral";
  return v > 0 ? "good" : v < 0 ? "bad" : "neutral";
}
