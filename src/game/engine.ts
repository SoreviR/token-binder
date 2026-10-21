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

/* ───────── Eras: qué cartas pueden salir en un sobre ───────── */

export type Era = 'vintage' | 'classic' | 'bwxy' | 'modern' | 'current';

export interface EraDef {
  id: Era;
  label: string;
  series: string[];                 // series de TCGdex que pertenecen a la era
  holoOnly: boolean;                // solo cartas con variante holo (en lo vintage la rareza dice solo "Rare")
  rarities: [rarity: string, weight: number][];  // rarezas que pueden salir en esta era
}

/**
 * Filtro «premium»: en las eras antiguas solo salen las holográficas; cuanto más moderna la era, más alta
 * es la rareza mínima (nada de comunes ni de rarezas normales). Se excluyen promos varias, TCG Pocket y kits.
 */
export const ERAS: EraDef[] = [
  { id: 'vintage', label: 'Vintage', series: ['base', 'gym', 'neo', 'lc', 'ecard'], holoOnly: true,
    rarities: [['Rare', 1], ['Holo Rare', 1], ['Rare Holo', 1]] },
  { id: 'classic', label: 'Clásica', series: ['ex', 'dp', 'pl', 'hgss', 'col'], holoOnly: true,
    rarities: [['Rare', 3], ['Holo Rare', 3], ['Rare Holo', 3], ['Rare Holo LV.X', 2], ['Rare PRIME', 2], ['LEGEND', 1], ['Ultra Rare', 2]] },
  { id: 'bwxy', label: 'Black & White / XY', series: ['bw', 'xy'], holoOnly: false,
    rarities: [['Ultra Rare', 9], ['Secret Rare', 1], ['Black White Rare', 1]] },
  { id: 'modern', label: 'Moderna', series: ['sm', 'swsh'], holoOnly: false,
    rarities: [['Ultra Rare', 4], ['Holo Rare V', 3], ['Holo Rare VMAX', 2], ['Holo Rare VSTAR', 2], ['Secret Rare', 2], ['Radiant Rare', 1],
      ['Amazing Rare', 1], ['Shiny rare V', 1], ['Shiny rare VMAX', 1], ['Illustration rare', 1]] },
  { id: 'current', label: 'Actual', series: ['sv', 'me'], holoOnly: false,
    rarities: [['Illustration rare', 5], ['Ultra Rare', 3], ['Special illustration rare', 3], ['Hyper rare', 2], ['Mega Hyper Rare', 1],
      ['Shiny Ultra Rare', 1], ['Mega Attack Rare', 1]] },
];
export const ERA_BY_ID = Object.fromEntries(ERAS.map(e => [e.id, e])) as Record<Era, EraDef>;

export function eraOfSerie(serie: string): Era | undefined {
  return ERAS.find(e => e.series.includes(serie))?.id;
}

/** ¿Cumple la carta el filtro premium de su era? (Se usa para elegir bien las evoluciones.) */
export function isPremium(c: Pick<Card, 'era' | 'rarity' | 'holo'>): boolean {
  if (!c.era) { return false; }
  const e = ERA_BY_ID[c.era];
  return e.rarities.some(([r]) => r.toLowerCase() === c.rarity.toLowerCase()) && (!e.holoOnly || !!c.holo);
}

export type Variant = 'shadowless' | 'first';
export const VARIANT_LABELS: Record<Variant, string> = { shadowless: 'Shadowless', first: '1.ª edición Shadowless' };

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
  setId?: string;
  era?: Era;
  holo?: boolean;
  shadowless?: boolean; // esta carta existe en versión Shadowless (solo el Set Base)
  variant?: Variant;    // variante sacada en este ejemplar
  image: string;        // URL base de assets.tcgdex.net (se le añade /low.webp o /high.webp)
}

/** Clave única de un ejemplar: el mismo id con otra variante es una carta distinta en el álbum. */
export const keyOf = (c: Pick<Card, 'id' | 'variant'>): string => (c.variant ? `${c.id}#${c.variant}` : c.id);

export interface Owned { card: Card; count: number; firstAt: number }
export interface Training { card: Card; born: number; evolved: number }
export interface GameState {
  v: 2;
  baseline: number;       // tokens de por vida al empezar: los sobres se cuentan desde aquí
  packsGranted: number;   // sobres ya concedidos por tokens
  packs: number;          // sobres normales sin abrir
  premium: number;        // sobres premium sin abrir
  balls: number;          // Pokébolas (1 carta) sin abrir
  collection: Record<string, Owned>;
  slots: (Training | null)[];
  mastered: number;       // cartas que completaron su línea evolutiva
  bonusPeriod: number;    // periodo de cuota en el que ya se dio el sobre por llegar al 100 %
  coins: number;          // monedas (con decimales; se muestran redondeadas hacia abajo)
  lastLifetime: number;   // tokens de por vida en la última cuenta de monedas
  luck: number;           // nivel de mejora de suerte (0-5)
}

/* ───────── Sobres ───────── */

export type PackKind = 'pack' | 'premium' | 'ball';

type EraWeights = Record<Era, number>;
/** Reparto de eras de una carta normal, de la carta «estrella» y de las últimas cartas de un premium. */
const BASE_W: EraWeights = { vintage: 34, classic: 28, bwxy: 16, modern: 14, current: 8 };
const HIT_W: EraWeights = { vintage: 14, classic: 20, bwxy: 20, modern: 26, current: 20 };
const TOP_W: EraWeights = { vintage: 8, classic: 12, bwxy: 20, modern: 30, current: 30 };

export function pickWeighted<T>(items: [T, number][], rng: () => number = Math.random): T {
  let r = rng() * items.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of items) { if ((r -= w) < 0) { return v; } }
  return items[items.length - 1][0];
}

/** La mejora de suerte da +20 % por nivel al peso de las eras modernas (las más raras). */
export function pickEra(w: EraWeights, luck = 0, rng: () => number = Math.random): Era {
  const boost = 1 + 0.2 * luck;
  return pickWeighted(ERAS.map(e => [e.id, w[e.id] * (e.id === 'modern' || e.id === 'current' ? boost : 1)] as [Era, number]), rng);
}

/** Era que pide cada carta de un sobre de ese tipo. */
export function rollEras(kind: PackKind, luck = 0, rng: () => number = Math.random): Era[] {
  const slots = kind === 'pack' ? [BASE_W, HIT_W]
    : kind === 'premium' ? [HIT_W, TOP_W] : [BASE_W];
  return slots.map(w => pickEra(w, luck, rng));
}

/** Rareza concreta dentro de una era, ordenadas al azar ponderado (para ir probando si alguna no tiene cartas). */
export function shuffledRarities(era: Era, rng: () => number = Math.random): string[] {
  const left = [...ERA_BY_ID[era].rarities];
  const out: string[] = [];
  while (left.length) {
    const r = pickWeighted(left, rng);
    out.push(r);
    left.splice(left.findIndex(([x]) => x === r), 1);
  }
  return out;
}

/** Variante Shadowless / 1.ª edición Shadowless (solo existe en cartas del Set Base). La suerte la favorece. */
export function rollVariant(card: Pick<Card, 'shadowless'>, luck = 0, rng: () => number = Math.random): Variant | undefined {
  if (!card.shadowless) { return undefined; }
  const m = 1 + 0.2 * luck;
  const r = rng();
  if (r < 0.06 * m) { return 'first'; }
  if (r < 0.06 * m + 0.24 * m) { return 'shadowless'; }
  return undefined;
}

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
  return {
    v: 2, baseline: lifetime, packsGranted: 0, packs: 1, premium: 0, balls: 0, collection: {}, slots: [null], mastered: 0,
    bonusPeriod: 0, coins: 0, lastLifetime: lifetime, luck: 0,
  };
}

/** Completa los campos añadidos en versiones nuevas a un estado guardado antes (sin dar monedas retroactivas). */
export function normalize(s: GameState, lifetime: number): GameState {
  s.premium ??= 0; s.balls ??= 0; s.coins ??= 0; s.luck ??= 0; s.lastLifetime ??= lifetime;
  return s;
}

/* ───────── Monedas y tienda ───────── */

export const COIN_EVERY_TOKENS = 10_000;
export const PACE_BONUS = 1.2;
export const MAX_SLOTS = 6;
export const MAX_LUCK = 5;

/** ¿Vas por debajo del ritmo del cupo? (% usado ≤ % del periodo transcurrido.) */
export function underPace(quotaPct: number, now: number, start: number, end: number): boolean {
  if (end <= start) { return false; }
  const elapsed = Math.min(1, Math.max(0, (now - start) / (end - start)));
  return quotaPct <= elapsed * 100;
}

/** Suma las monedas de los tokens usados desde la última vez. Devuelve cuántas se ganaron. */
export function earnCoins(s: GameState, lifetime: number, bonus: boolean): number {
  const delta = Math.max(0, lifetime - s.lastLifetime);
  s.lastLifetime = lifetime;
  const earned = (delta / COIN_EVERY_TOKENS) * (bonus ? PACE_BONUS : 1);
  s.coins += earned;
  return earned;
}

export type Item = 'pack' | 'premium' | 'ball' | 'slot' | 'luck';

const SLOT_PRICES = [400, 900, 1600, 2600, 4000];   // huecos 2 al 6
const LUCK_PRICES = [300, 600, 1200, 2400, 4800];   // niveles 1 al 5
const FIXED_PRICES: Record<'pack' | 'premium' | 'ball', number> = { pack: 80, premium: 250, ball: 15 };

/** Precio actual de un artículo, o null si ya se compró el máximo. */
export function priceOf(s: GameState, item: Item): number | null {
  if (item === 'slot') { return s.slots.length >= MAX_SLOTS ? null : SLOT_PRICES[s.slots.length - 1]; }
  if (item === 'luck') { return s.luck >= MAX_LUCK ? null : LUCK_PRICES[s.luck]; }
  return FIXED_PRICES[item];
}

export function buy(s: GameState, item: Item): boolean {
  const price = priceOf(s, item);
  if (price === null || s.coins < price) { return false; }
  s.coins -= price;
  if (item === 'pack') { s.packs++; }
  else if (item === 'premium') { s.premium++; }
  else if (item === 'ball') { s.balls++; }
  else if (item === 'slot') { s.slots.push(null); }
  else { s.luck++; }
  return true;
}

/** Descuenta un sobre/Pokébola del inventario. Devuelve false si no hay. */
export function consume(s: GameState, kind: PackKind): boolean {
  const key = kind === 'pack' ? 'packs' : kind === 'premium' ? 'premium' : 'balls';
  if (s[key] < 1) { return false; }
  s[key]--;
  return true;
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
    const k = keyOf(c);
    const o = s.collection[k];
    if (o) { o.count++; } else { s.collection[k] = { card: c, count: 1, firstAt: now }; }
  }
}

/** Monedas por vender una copia repetida: según la categoría de rareza, con extra para las variantes Shadowless. */
const SELL_VALUE = [3, 6, 12, 30, 70, 160, 400];
export function sellValue(c: Pick<Card, 'tier' | 'variant'>): number {
  return SELL_VALUE[c.tier] * (c.variant === 'first' ? 5 : c.variant === 'shadowless' ? 2 : 1);
}

/** Vende las copias repetidas (siempre te quedas con una). Con `key` solo esa carta. Devuelve monedas ganadas. */
export function sellDuplicates(s: GameState, key?: string): number {
  let earned = 0;
  for (const [k, o] of Object.entries(s.collection)) {
    if (key !== undefined && k !== key) { continue; }
    if (o.count > 1) { earned += (o.count - 1) * sellValue(o.card); o.count = 1; }
  }
  s.coins += earned;
  return earned;
}

/** Pone una carta de la colección a entrenar en un hueco libre. Devuelve false si no se puede. */
export function startTraining(s: GameState, cardId: string, lifetime: number): boolean {
  const owned = s.collection[cardId];
  const slot = s.slots.findIndex(x => x === null);
  if (!owned || slot < 0) { return false; }
  if (s.slots.some(t => t && keyOf(t.card) === cardId)) { return false; }
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
