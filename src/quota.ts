import { Bucket, totalOf } from './usage/store';

export type Unit = 'tokens' | 'credits';

/** Inicio (ms, UTC) del periodo de cuota vigente según resetDay. */
export function periodStart(now: number, resetDay: number): number {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  if (d.getUTCDate() < resetDay) { m -= 1; }
  return Date.UTC(y, m, resetDay);
}

export function used(b: Bucket, unit: Unit): number { return unit === 'credits' ? b.credits : totalOf(b); }
export const percent = (u: number, limit: number) => (limit > 0 ? (u / limit) * 100 : 0);

/** "5M" → 5_000_000, "750k" → 750_000, "1.5M" → 1_500_000, "5.000.000" → 5_000_000. */
export function parseLimit(s: string): number | undefined {
  const m = /^\s*(\d[\d.,]*)\s*([kmb])?\s*$/i.exec(s);
  if (!m) { return undefined; }
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b'];
  // Con sufijo el punto/coma es decimal (1.5M); sin sufijo son separadores de miles (5.000.000).
  const n = mult ? parseFloat(m[1].replace(',', '.')) * mult : parseFloat(m[1].replace(/[.,]/g, ''));
  return n > 0 && isFinite(n) ? Math.round(n) : undefined;
}

export function fmt(n: number): string {
  if (n >= 1e9) { return (n / 1e9).toFixed(2) + 'B'; }
  if (n >= 1e6) { return (n / 1e6).toFixed(2) + 'M'; }
  if (n >= 1e3) { return (n / 1e3).toFixed(1) + 'K'; }
  return String(Math.round(n * 100) / 100);
}
