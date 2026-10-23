// Items found in mystery boxes, the branching evolution table and the rare transformations. Pure: no VS Code, no network.
import type { Card } from './engine';

export const ITEM_LIST = [
  // evolution items: they only come out of evolution boxes (see rollEvoBox), never out of a mystery box
  { id: 'fire-stone', kind: 'evolve', weight: 10 },
  { id: 'water-stone', kind: 'evolve', weight: 10 },
  { id: 'thunder-stone', kind: 'evolve', weight: 10 },
  { id: 'leaf-stone', kind: 'evolve', weight: 10 },
  { id: 'ice-stone', kind: 'evolve', weight: 6 },
  { id: 'sun-stone', kind: 'evolve', weight: 6 },
  { id: 'moon-stone', kind: 'evolve', weight: 6 },
  { id: 'shiny-stone', kind: 'evolve', weight: 5 },
  { id: 'dawn-stone', kind: 'evolve', weight: 5 },
  { id: 'kings-rock', kind: 'evolve', weight: 5 },
  // training
  { id: 'rare-candy', kind: 'train', weight: 40 },
  { id: 'lucky-egg', kind: 'train', weight: 24 },
  // transformations (rare)
  { id: 'mega-stone', kind: 'transform', weight: 2 },
  { id: 'dynamax-band', kind: 'transform', weight: 2 },
  { id: 'star-core', kind: 'transform', weight: 2 },
  { id: 'tera-orb', kind: 'transform', weight: 2 },
  // card protection (see grading.ts)
  { id: 'sleeve', kind: 'protect', weight: 14 },
  { id: 'toploader', kind: 'protect', weight: 8 },
  // held in battle: they shift the style of a card, never its total power
  { id: 'sturdy-plate', kind: 'held', weight: 7 },
  { id: 'choice-band', kind: 'held', weight: 7 },
  { id: 'quick-claw', kind: 'held', weight: 7 },
  { id: 'lucky-charm', kind: 'held', weight: 7 },
  // repair (only in the shop: weight 0 never comes out of a box; see mishaps.ts)
  { id: 'hair-dryer', kind: 'repair', weight: 0 },
] as const;

export type ItemId = (typeof ITEM_LIST)[number]['id'];
export type ItemKind = (typeof ITEM_LIST)[number]['kind'];

export const ITEM_IDS: ItemId[] = ITEM_LIST.map(i => i.id);
export const isItemId = (s: unknown): s is ItemId => typeof s === 'string' && (ITEM_IDS as string[]).includes(s);
export const kindOf = (id: ItemId): ItemKind => ITEM_LIST.find(i => i.id === id)!.kind;

export type HeldId = Extract<(typeof ITEM_LIST)[number], { kind: 'held' }>['id'];
export const HELD_IDS: HeldId[] = ITEM_LIST.filter(i => i.kind === 'held').map(i => i.id as HeldId);
export const isHeldId = (s: unknown): s is HeldId => (HELD_IDS as string[]).includes(String(s));

/**
 * What each held item does to a fighter. Every entry keeps the total power the same (HP × ATK, or the expected damage
 * per round): they change how a card fights, not how strong it is. test/balance.test.ts enforces it on the real corpus.
 */
export interface HeldEffect { hp?: number; atk?: number; spd?: number; crit?: number; miss?: number }
export const HELD_EFFECTS: Record<HeldId, HeldEffect> = {
  'sturdy-plate': { hp: 1.1, atk: 1 / 1.1 },        // tankier, hits softer
  'choice-band': { hp: 1 / 1.1, atk: 1.1 },         // glass cannon
  'quick-claw': { spd: 1.3, atk: 0.99 },            // acts first more often, a little less damage
  'lucky-charm': { crit: 0.2, miss: 0.09 },         // many more critical hits and more misses: a much swingier fight
};

/** Price of a mystery box and of an evolution box in coins. */
export const BOX_PRICE = 120;
export const EVO_BOX_PRICE = 50;
/** Coins an evolution stone is recycled for (below the price of the box, so buying to recycle never pays). */
export const STONE_VALUE = 15;
/** Mystery boxes in a row without a transformation item after which the next one is sure to have one. */
export const PITY_BOXES = 30;

function pickWeighted<T>(entries: readonly (readonly [T, number])[], rng: () => number): T {
  let r = rng() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [v, w] of entries) { if ((r -= w) < 0) { return v; } }
  return entries[entries.length - 1][0];
}

/**
 * Weighted pick of a mystery box's content: everything but evolution stones. Luck makes the rare transformation items more
 * likely (+20% per level); `sure` (the pity) leaves only those.
 */
export function rollBox(luck = 0, rng: () => number = Math.random, sure = false): ItemId {
  const pool = ITEM_LIST.filter(i => i.weight > 0 && i.kind !== 'evolve' && (!sure || i.kind === 'transform'));
  return pickWeighted(pool.map(i => [i.id, i.weight * (i.kind === 'transform' ? 1 + 0.2 * luck : 1)] as const), rng);
}

/** How much more likely the stones of a branching line the player already owns are in an evolution box. */
export const EVO_FOCUS = 6;

/** How much less likely an evolution item you already hold is, so a box brings variety instead of repeats. */
export const EVO_REPEAT = 3;

/**
 * Weighted pick of an evolution box's content: one of the evolution items. The ones that pick a branch of a line the player
 * has (`lines`: names of the cards in the album and in training) weigh EVO_FOCUS times more, and the ones already in stock
 * (`stock`) EVO_REPEAT times less.
 */
export function rollEvoBox(lines: string[], rng: () => number = Math.random, stock: Partial<Record<ItemId, number>> = {}): ItemId {
  const wanted = new Set<ItemId>(lines.map(baseName).flatMap(n => Object.values(BRANCH_ITEMS[n] ?? {})));
  return pickWeighted(ITEM_LIST.filter(i => i.kind === 'evolve')
    .map(i => [i.id, i.weight * (wanted.has(i.id) ? EVO_FOCUS : 1) / ((stock[i.id] ?? 0) > 0 ? EVO_REPEAT : 1)] as const), rng);
}

/* ───────── Branching evolutions ───────── */

/**
 * Name of a Pokémon without the card-type decorations TCGdex adds: "Flareon ex", "Leafeon-GX", "Espeon δ", "Dark Vaporeon",
 * "Lt. Surge's Jolteon", "Mega Gardevoir ex", "M Rayquaza EX" → the species. Regional forms ("Alolan Raichu") are kept.
 */
export function baseName(name: string): string {
  let n = name.trim().replace(/-(?:EX|GX)$/i, '');
  for (let i = 0; i < 3; i++) { n = n.replace(/\s+(?:ex|GX|VMAX|VSTAR|V-UNION|V|BREAK|LV\.X|Prime|LEGEND|δ|Star|★)$/i, ''); }
  n = n.replace(/^(?:M|Mega|Dark|Light|Radiant|Shining)\s+/i, '').replace(/^.+'s\s+/, '');
  return n.trim();
}

/** Which item picks which branch (the rest of the branches of a line are free to choose). Keys are species names. */
export const BRANCH_ITEMS: Record<string, Record<string, ItemId>> = {
  Eevee: {
    Vaporeon: 'water-stone', Jolteon: 'thunder-stone', Flareon: 'fire-stone', Espeon: 'sun-stone',
    Umbreon: 'moon-stone', Leafeon: 'leaf-stone', Glaceon: 'ice-stone', Sylveon: 'shiny-stone',
  },
  Gloom: { Vileplume: 'leaf-stone', Bellossom: 'sun-stone' },
  Poliwhirl: { Poliwrath: 'water-stone', Politoed: 'kings-rock' },
  Slowpoke: { Slowking: 'kings-rock' },
  Kirlia: { Gallade: 'dawn-stone' },
  Snorunt: { Froslass: 'dawn-stone' },
  Cosmoem: { Solgaleo: 'sun-stone', Lunala: 'moon-stone' },
};

/** The item needed to evolve `from` into `to`, if that branch requires one. */
export const branchItem = (from: string, to: string): ItemId | undefined => BRANCH_ITEMS[baseName(from)]?.[to];

/* ───────── Rare transformations ───────── */

export type Transform = 'mega' | 'vmax' | 'vstar' | 'tera';
export const TRANSFORM_BY_ITEM: Partial<Record<ItemId, Transform>> = {
  'mega-stone': 'mega', 'dynamax-band': 'vmax', 'star-core': 'vstar', 'tera-orb': 'tera',
};
export const MIN_TRANSFORM_LEVEL = 20;

/** Card names that count as the transformed version of a species. */
export function transformNames(base: string, kind: Transform): string[] {
  switch (kind) {
    case 'mega': return [`M ${base} EX`, `Mega ${base} ex`];
    case 'vmax': return [`${base} VMAX`];
    case 'vstar': return [`${base} VSTAR`];
    case 'tera': return [`${base} ex`];
  }
}

/** Can this card be transformed? Only finished (Master) cards of level 20+ that are not already a transformed form. */
export function canTransform(card: Pick<Card, 'name' | 'stage'>, owned: { mastered?: boolean; level: number }, kind: Transform): boolean {
  if (!owned.mastered || owned.level < MIN_TRANSFORM_LEVEL) { return false; }
  if (['MEGA', 'VMAX', 'VSTAR'].includes(card.stage ?? '')) { return false; }
  if (kind === 'tera' && /\sex$/i.test(card.name)) { return false; }
  return true;
}
