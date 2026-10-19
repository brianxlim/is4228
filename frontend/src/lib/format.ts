export const NAMES: Record<string, string> = {
  "D05.SI": "DBS",
  "O39.SI": "OCBC",
  "U11.SI": "UOB",
  "ES3.SI": "STI ETF",
};

export function num(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-SG", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function pct(v: number | null | undefined, digits = 2, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const s = num(v, digits);
  return `${signed && v > 0 ? "+" : ""}${s}%`;
}

export function sgd(v: number | null | undefined, digits = 0, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = v < 0 ? "−" : signed && v > 0 ? "+" : "";
  return `${sign}S$${num(Math.abs(v), digits)}`;
}

export function pval(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v < 0.0001 ? "<0.0001" : v.toFixed(4);
}

export function shortDate(d: string): string {
  const dt = new Date(`${d}T00:00:00`);
  return dt.toLocaleDateString("en-SG", { month: "short", year: "2-digit" });
}
