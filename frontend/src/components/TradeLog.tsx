"use client";

import { useMemo, useState } from "react";
import { Download, ListFilter } from "lucide-react";
import type { BacktestResult, Direction, ExitReason, Trade } from "@/lib/types";
import { num, pct, sgd } from "@/lib/format";

const COLUMNS: (keyof Trade)[] = [
  "trade_id", "direction", "entry_signal_date", "entry_date", "exit_signal_date", "exit_date", "holding_days",
  "entry_z", "exit_z", "exit_reason", "hedge_ratio", "shares_a", "shares_b", "price_a_entry", "price_a_exit",
  "price_b_entry", "price_b_exit", "gross_pnl_sgd", "fees_sgd", "net_pnl_sgd", "return_pct", "is_open",
];

function toCsv(trades: Trade[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [COLUMNS.join(","), ...trades.map((t) => COLUMNS.map((c) => esc(t[c])).join(","))].join("\n");
}

export default function TradeLog({ result }: { result: BacktestResult }) {
  const [dir, setDir] = useState<"ALL" | Direction>("ALL");
  const [reason, setReason] = useState<"ALL" | ExitReason>("ALL");
  const [outcome, setOutcome] = useState<"ALL" | "WIN" | "LOSS">("ALL");
  const { trades, params, labels } = result;

  const rows = useMemo(
    () =>
      trades.filter(
        (t) =>
          (dir === "ALL" || t.direction === dir) &&
          (reason === "ALL" || t.exit_reason === reason) &&
          (outcome === "ALL" || (outcome === "WIN" ? t.net_pnl_sgd > 0 : t.net_pnl_sgd <= 0)),
      ),
    [trades, dir, reason, outcome],
  );

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trades_${params.asset_a}_${params.asset_b}_${params.transaction_cost_bps}bps.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalNet = rows.reduce((s, t) => s + t.net_pnl_sgd, 0);

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">
          Trade Log <span className="font-normal text-ink-muted">· {rows.length} of {trades.length} trades · net {sgd(totalNet, 0, true)}</span>
        </h3>
        <ListFilter size={14} className="text-ink-muted" />
        <Select value={dir} onChange={setDir} options={[["ALL", "All directions"], ["LONG_SPREAD", "Long spread"], ["SHORT_SPREAD", "Short spread"]]} />
        <Select value={reason} onChange={setReason} options={[["ALL", "All exits"], ["MEAN_REVERSION", "Mean reversion"], ["STOP_LOSS", "Stop loss"], ["END_OF_PERIOD", "End of period"]]} />
        <Select value={outcome} onChange={setOutcome} options={[["ALL", "Wins & losses"], ["WIN", "Winners"], ["LOSS", "Losers"]]} />
        <button
          onClick={exportCsv}
          disabled={!rows.length}
          className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface-raised px-3 py-1.5 text-xs font-medium hover:bg-surface-hover disabled:opacity-50"
        >
          <Download size={13} /> Export Trade Log CSV
        </button>
      </div>

      <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
        <table className="tabular w-full min-w-[1100px] whitespace-nowrap text-xs">
          <thead className="sticky top-0 bg-surface-raised text-ink-muted">
            <tr className="[&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
              <th>#</th>
              <th>Direction</th>
              <th>Entry</th>
              <th>Exit</th>
              <th className="text-right!">Days</th>
              <th className="text-right!">Z in → out</th>
              <th>Exit reason</th>
              <th className="text-right!">{labels.asset_a} qty @ in → out</th>
              <th className="text-right!">{labels.asset_b} qty @ in → out</th>
              <th className="text-right!">Gross P&amp;L</th>
              <th className="text-right!">Fees</th>
              <th className="text-right!">Net P&amp;L</th>
              <th className="text-right!">Return</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.trade_id} className="border-t border-line hover:bg-surface-raised [&>td]:px-2 [&>td]:py-1.5">
                <td className="text-ink-muted">{t.trade_id}</td>
                <td>
                  <span className={`rounded px-1.5 py-0.5 font-medium ${t.direction === "LONG_SPREAD" ? "bg-series-1/15 text-series-1" : "bg-series-2/15 text-series-2"}`}>
                    {t.direction === "LONG_SPREAD" ? "▲ LONG" : "▼ SHORT"}
                  </span>
                </td>
                <td title={`signal ${t.entry_signal_date}`}>{t.entry_date}</td>
                <td title={`signal ${t.exit_signal_date}`}>{t.exit_date}{t.is_open && <span className="ml-1 text-ink-muted">(open)</span>}</td>
                <td className="text-right">{t.holding_days}</td>
                <td className="text-right">{num(t.entry_z, 2)} → {num(t.exit_z, 2)}</td>
                <td><ReasonBadge reason={t.exit_reason} /></td>
                <td className="text-right">{t.shares_a > 0 ? "+" : ""}{t.shares_a.toLocaleString()} @ {num(t.price_a_entry, 2)} → {num(t.price_a_exit, 2)}</td>
                <td className="text-right">{t.shares_b > 0 ? "+" : ""}{t.shares_b.toLocaleString()} @ {num(t.price_b_entry, 2)} → {num(t.price_b_exit, 2)}</td>
                <td className="text-right">{sgd(t.gross_pnl_sgd, 0, true)}</td>
                <td className="text-right text-ink-muted">{sgd(t.fees_sgd, 0)}</td>
                <td className="text-right">
                  <span className={`rounded px-1.5 py-0.5 font-medium ${t.net_pnl_sgd > 0 ? "bg-good/15 text-good" : "bg-critical/15 text-critical"}`}>
                    {sgd(t.net_pnl_sgd, 0, true)}
                  </span>
                </td>
                <td className="text-right">{pct(t.return_pct, 2, true)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={13} className="px-2 py-6 text-center text-ink-muted">No trades match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-ink-muted">
        Signals on day-T close, fills on the {params.execution_lag ? "next" : "same"} close. Quantities rounded to SGX board lots of 100; negative = short.
        Return % is net P&amp;L over equity at entry. Hover a date to see its signal date.
      </p>
    </section>
  );
}

function ReasonBadge({ reason }: { reason: ExitReason }) {
  const style =
    reason === "MEAN_REVERSION" ? "bg-good/15 text-good" : reason === "STOP_LOSS" ? "bg-critical/15 text-critical" : "bg-surface-hover text-ink-secondary";
  const icon = reason === "MEAN_REVERSION" ? "↺" : reason === "STOP_LOSS" ? "✕" : "■";
  return <span className={`rounded px-1.5 py-0.5 font-medium ${style}`}>{icon} {reason}</span>;
}

function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded-lg border border-line-strong bg-surface-raised px-2 py-1.5 text-xs"
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}
