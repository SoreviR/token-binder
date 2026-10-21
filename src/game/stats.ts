// Combat stats and market value of a card. Pure: no network or VS Code, so it can be tested.
import type { Card } from './engine';
import { StrengthOptions, combatStats } from './strength';

export interface Stats { hp: number; atk: number; def: number; spd: number; level: number }

/** "20+", "30×", "120" → base number; attacks that only have an effect are worth 0. */
export function parseDamage(raw: unknown): number {
  if (typeof raw === 'number') { return Math.max(0, raw); }
  const m = /\d+/.exec(String(raw ?? ''));
  return m ? Number(m[0]) : 0;
}

/**
 * Stats of a card at its level, from the same strength model the battles use (see strength.ts), so the album and the
 * fights always agree. When card data is missing (old cache, offline) the defaults keep it playable.
 */
export function statsOf(card: Card, xp = 0, opts: StrengthOptions = {}): Stats {
  return combatStats(card, xp, opts).stats;
}

/* ───────── Market value (moved to market.ts; re-exported so existing imports keep working) ───────── */

export { collectorLabel, marketValue, parsePricing } from './market';
export type { Collector } from './market';
