// Combat stats and market value of a card. Pure: no network or VS Code, so it can be tested.
import type { Card, Era } from './engine';
import { levelOf } from './engine';

export interface Stats { hp: number; atk: number; def: number; spd: number; level: number }

/** Per-era reference: a 320 HP VMAX must not crush an 80 HP vintage holo, so values are normalized against what is typical of the era. */
const ERA_REF: Record<Era, { hp: number; dmg: number }> = {
  vintage: { hp: 80, dmg: 50 },
  classic: { hp: 100, dmg: 70 },
  bwxy: { hp: 170, dmg: 120 },
  modern: { hp: 220, dmg: 180 },
  current: { hp: 250, dmg: 200 },
};

const STAGE_MULT: Record<string, number> = { Stage1: 1.08, Stage2: 1.15, MEGA: 1.15, VMAX: 1.15, VSTAR: 1.15, BREAK: 1.15, 'LEVEL-UP': 1.15 };

/** "20+", "30×", "120" → base number; attacks that only have an effect are worth 0. */
export function parseDamage(raw: unknown): number {
  if (typeof raw === 'number') { return Math.max(0, raw); }
  const m = /\d+/.exec(String(raw ?? ''));
  return m ? Number(m[0]) : 0;
}

/** Stats of a card at its level (from XP). When data is missing (old cache, offline) they are estimated from the rarity. */
export function statsOf(card: Card, xp = 0): Stats {
  const ref = ERA_REF[card.era ?? 'classic'];
  const level = levelOf(xp);
  const maxDmg = Math.max(0, ...(card.attacks ?? []).map(a => a.damage));
  const hpBase = card.hp ?? ref.hp;
  // "20+" attacks of modern cards scale with effects we cannot see here, so they get a floor based on the rarity.
  const floor = ref.dmg * (0.25 + 0.05 * card.tier);
  const dmgBase = card.attacks?.length ? Math.max(maxDmg, floor) : ref.dmg * (0.45 + 0.07 * card.tier);
  const retreat = card.retreat ?? 1;
  const mult = (1 + 0.02 * (level - 1)) * (STAGE_MULT[card.stage ?? ''] ?? 1) * (1 + 0.01 * card.tier);
  return {
    hp: Math.round((100 * hpBase / ref.hp) * mult),
    atk: Math.round((100 * dmgBase / ref.dmg) * mult),
    def: Math.round((40 + 10 * retreat) * mult),
    spd: Math.round((110 - 15 * retreat) * (1 + 0.005 * (level - 1))),
    level,
  };
}

/* ───────── Market value ───────── */

/** Approximate value in euros (Cardmarket; otherwise TCGplayer dollars). undefined when there is no price. */
export function marketValue(card: Pick<Card, 'price'>): number | undefined {
  const p = card.price;
  if (p?.eur !== undefined) { return p.eur; }
  if (p?.usd !== undefined) { return Math.round(p.usd * 0.92 * 100) / 100; }
  return undefined;
}

export type Collector = 'common' | 'popular' | 'valuable' | 'sought' | 'chase' | 'grail';
const COLLECTOR: [max: number, id: Collector][] = [
  [1, 'common'], [5, 'popular'], [25, 'valuable'], [100, 'sought'], [500, 'chase'], [Infinity, 'grail'],
];
/** Collectibility id according to market value (the label is translated in the UI as `collector.<id>`). */
export function collectorLabel(card: Pick<Card, 'price'>): Collector | undefined {
  const v = marketValue(card);
  return v === undefined ? undefined : COLLECTOR.find(([max]) => v < max)![1];
}

/** Extracts the price from TCGdex's `pricing` field: Cardmarket trend (EUR) and the highest TCGplayer market price (USD). */
export function parsePricing(pricing: any): { eur?: number; usd?: number } {
  const num = (x: unknown) => (typeof x === 'number' && x > 0 ? Math.round(x * 100) / 100 : undefined);
  const cm = pricing?.cardmarket;
  const eur = num(cm?.trend) ?? num(cm?.avg30) ?? num(cm?.avg);
  let usd: number | undefined;
  const tp = pricing?.tcgplayer;
  if (tp && typeof tp === 'object') {
    for (const v of Object.values(tp)) {
      const m = num((v as any)?.marketPrice);
      if (m !== undefined) { usd = usd === undefined ? m : Math.max(usd, m); }
    }
  }
  return { ...(eur !== undefined ? { eur } : {}), ...(usd !== undefined ? { usd } : {}) };
}
