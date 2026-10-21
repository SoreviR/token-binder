// Stats de combate y valor de mercado de una carta. Puro: sin red ni VS Code, para poder testearlo.
import type { Card, Era } from './engine';
import { levelOf } from './engine';

export interface Stats { hp: number; atk: number; def: number; spd: number; level: number }

/** Referencia por era: un VMAX de 320 PS no debe aplastar a una holo vintage de 80, así que se normaliza contra lo típico de su era. */
const ERA_REF: Record<Era, { hp: number; dmg: number }> = {
  vintage: { hp: 80, dmg: 50 },
  classic: { hp: 100, dmg: 70 },
  bwxy: { hp: 170, dmg: 120 },
  modern: { hp: 220, dmg: 180 },
  current: { hp: 250, dmg: 200 },
};

const STAGE_MULT: Record<string, number> = { Stage1: 1.08, Stage2: 1.15, MEGA: 1.15, VMAX: 1.15, VSTAR: 1.15, BREAK: 1.15, 'LEVEL-UP': 1.15 };

/** «20+», «30×», «120» → número base; los ataques que solo tienen efecto valen 0. */
export function parseDamage(raw: unknown): number {
  if (typeof raw === 'number') { return Math.max(0, raw); }
  const m = /\d+/.exec(String(raw ?? ''));
  return m ? Number(m[0]) : 0;
}

/** Stats de una carta con su nivel (por XP). Si faltan datos (caché antigua, sin red) se estiman por la rareza. */
export function statsOf(card: Card, xp = 0): Stats {
  const ref = ERA_REF[card.era ?? 'classic'];
  const level = levelOf(xp);
  const maxDmg = Math.max(0, ...(card.attacks ?? []).map(a => a.damage));
  const hpBase = card.hp ?? ref.hp;
  // Los ataques «20+» de las cartas modernas escalan con efectos que aquí no se ven: se les da un suelo según la rareza.
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

/* ───────── Valor de mercado ───────── */

/** Valor aproximado en euros (Cardmarket; si no hay, TCGplayer en dólares). undefined si no hay precio. */
export function marketValue(card: Pick<Card, 'price'>): number | undefined {
  const p = card.price;
  if (p?.eur !== undefined) { return p.eur; }
  if (p?.usd !== undefined) { return Math.round(p.usd * 0.92 * 100) / 100; }
  return undefined;
}

const COLLECTOR: [max: number, label: string][] = [
  [1, 'Común de mercado'], [5, 'Popular'], [25, 'Valiosa'], [100, 'Muy cotizada'], [500, 'Chase'], [Infinity, 'Grail'],
];
/** Etiqueta de coleccionismo según su valor en el mercado. */
export function collectorLabel(card: Pick<Card, 'price'>): string | undefined {
  const v = marketValue(card);
  return v === undefined ? undefined : COLLECTOR.find(([max]) => v < max)![1];
}

/** Extrae el precio del campo `pricing` de TCGdex: tendencia de Cardmarket (EUR) y precio de mercado de TCGplayer (USD). */
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
