// Motor del juego de cartas: sobres → cartas con rareza → entrenamiento por tokens → evolución/graduación.
// Puro y sin dependencias de VS Code ni de red (la red entra por funciones inyectadas) para poder testearlo.

export const TIER_NAMES = ['Común', 'Poco común', 'Rara', 'Holo', 'Ultra', 'Ilustración', 'Secreta'] as const;

/** Rarezas de TCGdex agrupadas por categoría (0 = más común … 6 = más rara). */
export const TIER_RARITIES: string[][] = [
  ['Common', 'One Diamond'],
  ['Uncommon', 'Two Diamond'],
  ['Rare', 'Three Diamond', 'Promo'],
  ['Rare Holo', 'Holo Rare', 'Four Diamond', 'Double rare', 'Rare Holo LV.X', 'Rare PRIME', 'LEGEND', 'Classic Collection', 'Black White Rare', 'Amazing Rare'],
  ['Holo Rare V', 'Holo Rare VMAX', 'Holo Rare VSTAR', 'Ultra Rare', 'Radiant Rare', 'ACE SPEC Rare', 'Shiny rare', 'Shiny rare V', 'Shiny rare VMAX',
    'One Star', 'One Shiny', 'Two Shiny', 'Pikachu Rare', 'Mega Attack Rare', 'RGB Rare', 'Futuristic Rare'],
  ['Illustration rare', 'Special illustration rare', 'Two Star'],
  ['Secret Rare', 'Hyper rare', 'Crown', 'Mega Hyper Rare', 'Shiny Ultra Rare', 'Three Star'],
];

const TIER_BY_RARITY = new Map(TIER_RARITIES.flatMap((names, tier) => names.map(n => [n.toLowerCase(), tier] as const)));
export const tierOf = (rarity?: string): number => TIER_BY_RARITY.get((rarity ?? '').toLowerCase()) ?? 2;

export interface Card {
  id: string;
  name: string;
  rarity: string;
  tier: number;
  stage?: string;       // Basic | Stage1 | Stage2 | VMAX …
  evolveFrom?: string;
  dexId?: number;
  hp?: number;
  types?: string[];
  set?: string;
  image: string;        // URL base de assets.tcgdex.net (se le añade /low.webp o /high.webp)
}
export interface Owned { card: Card; count: number; firstAt: number }
export interface Training { card: Card; born: number; evolved: number }
export interface GameState {
  v: 2;
  baseline: number;       // tokens de por vida al empezar: los sobres se cuentan desde aquí
  packsGranted: number;   // sobres ya concedidos por tokens
  packs: number;          // sobres sin abrir
  collection: Record<string, Owned>;
  slots: (Training | null)[];
  mastered: number;       // cartas que completaron su línea evolutiva
  bonusPeriod: number;    // periodo de cuota en el que ya se dio el sobre por llegar al 100 %
}

/* ───────── Sobres ───────── */

type Weights = [tier: number, weight: number][];
const COMMON_SLOT: Weights = [[0, 85], [1, 15]];
const UNCOMMON_SLOT: Weights = [[1, 80], [2, 20]];
const HIT_SLOT: Weights = [[2, 55], [3, 25], [4, 12], [5, 6], [6, 2]];
export const PACK_SLOTS: Weights[] = [COMMON_SLOT, COMMON_SLOT, COMMON_SLOT, UNCOMMON_SLOT, HIT_SLOT];

export function pickTier(w: Weights, rng: () => number = Math.random): number {
  let r = rng() * w.reduce((s, [, x]) => s + x, 0);
  for (const [tier, x] of w) { if ((r -= x) < 0) { return tier; } }
  return w[w.length - 1][0];
}

/** Categorías de rareza que pide cada una de las 5 cartas de un sobre. */
export const rollPackTiers = (rng: () => number = Math.random): number[] => PACK_SLOTS.map(w => pickTier(w, rng));

/* ───────── Entrenamiento ───────── */

/** Tokens que dura cada etapa antes de evolucionar (se aplica growth.multiplier). */
const STAGE_TOKENS = [1_500_000, 4_500_000, 6_000_000, 8_000_000];

/** Tokens acumulados (desde que empezó a entrenar) en los que termina la etapa k. */
export function stageEnd(k: number, mult: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) { sum += STAGE_TOKENS[Math.min(i, STAGE_TOKENS.length - 1)]; }
  return Math.round(sum * mult);
}

export interface TrainingProgress { into: number; span: number; pct: number; due: boolean }

export function trainingProgress(t: Training, lifetime: number, mult: number): TrainingProgress {
  const acc = Math.max(0, lifetime - t.born);
  const start = t.evolved === 0 ? 0 : stageEnd(t.evolved - 1, mult);
  const end = stageEnd(t.evolved, mult);
  return { into: Math.min(acc - start, end - start), span: end - start, pct: Math.min(100, ((acc - start) / (end - start)) * 100), due: acc >= end };
}

/* ───────── Estado ───────── */

export function newState(lifetime: number): GameState {
  // Un sobre de bienvenida para que haya algo que abrir desde el primer momento.
  return { v: 2, baseline: lifetime, packsGranted: 0, packs: 1, collection: {}, slots: [null], mastered: 0, bonusPeriod: 0 };
}

export function grantPacks(s: GameState, lifetime: number, every: number): number {
  const n = Math.floor(Math.max(0, lifetime - s.baseline) / every) - s.packsGranted;
  if (n > 0) { s.packs += n; s.packsGranted += n; return n; }
  return 0;
}

export function nextPackProgress(s: GameState, lifetime: number, every: number): { into: number; span: number; pct: number } {
  const into = Math.max(0, lifetime - s.baseline) - s.packsGranted * every;
  return { into: Math.max(0, into), span: every, pct: Math.max(0, Math.min(100, (into / every) * 100)) };
}

export function addCards(s: GameState, cards: Card[], now = Date.now()): void {
  for (const c of cards) {
    const o = s.collection[c.id];
    if (o) { o.count++; } else { s.collection[c.id] = { card: c, count: 1, firstAt: now }; }
  }
}

/** Pone una carta de la colección a entrenar en un hueco libre. Devuelve false si no se puede. */
export function startTraining(s: GameState, cardId: string, lifetime: number): boolean {
  const owned = s.collection[cardId];
  const slot = s.slots.findIndex(x => x === null);
  if (!owned || slot < 0) { return false; }
  if (s.slots.some(t => t?.card.id === cardId)) { return false; }
  s.slots[slot] = { card: owned.card, born: lifetime, evolved: 0 };
  return true;
}

export type FindNext = (card: Card) => Promise<{ ok: true; card: Card | null } | { ok: false }>;

/**
 * Resuelve las etapas cumplidas: evoluciona a la carta siguiente o, si la línea terminó, gradúa la carta
 * (+1 sobre). Si la búsqueda falla por red (ok:false) no se toca nada y se reintenta más tarde.
 */
export async function resolveDue(s: GameState, lifetime: number, mult: number, findNext: FindNext, now = Date.now()): Promise<string[]> {
  const events: string[] = [];
  for (let i = 0; i < s.slots.length; i++) {
    for (let guard = 0; guard < 10; guard++) {
      const t = s.slots[i];
      if (!t || !trainingProgress(t, lifetime, mult).due) { break; }
      const r = await findNext(t.card);
      if (!r.ok) { break; }
      if (r.card) {
        addCards(s, [r.card], now);
        s.slots[i] = { card: r.card, born: t.born, evolved: t.evolved + 1 };
        events.push(`evolve:${r.card.name}`);
      } else {
        s.slots[i] = null;
        s.mastered++;
        s.packs++;
        events.push(`graduate:${t.card.name}`);
      }
    }
  }
  return events;
}
