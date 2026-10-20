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

export function fmt(n: number): string {
  if (n >= 1e9) { return (n / 1e9).toFixed(2) + 'B'; }
  if (n >= 1e6) { return (n / 1e6).toFixed(2) + 'M'; }
  if (n >= 1e3) { return (n / 1e3).toFixed(1) + 'K'; }
  return String(Math.round(n * 100) / 100);
}
