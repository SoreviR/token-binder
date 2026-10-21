// Market value of a card (Cardmarket / TCGplayer) and its collectibility class. Pure: no network or VS Code.
import type { Card } from './engine';

/** Approximate value in euros (Cardmarket; otherwise TCGplayer dollars). undefined when there is no price. */
export function marketValue(card: Pick<Card, 'price'>): number | undefined {
  const p = card.price;
  if (p?.eur !== undefined) { return p.eur; }
  if (p?.usd !== undefined) { return Math.round(p.usd * 0.92 * 100) / 100; }
  return undefined;
}

export type Collector = 'common' | 'popular' | 'valuable' | 'sought' | 'chase' | 'grail';
export const COLLECTOR_CLASSES: Collector[] = ['common', 'popular', 'valuable', 'sought', 'chase', 'grail'];
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
