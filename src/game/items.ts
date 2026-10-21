// Items found in mystery boxes, the branching evolution table and the rare transformations. Pure: no VS Code, no network.
import type { Card } from './engine';

export const ITEM_LIST = [
  // evolution items (common)
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
  { id: 'rare-candy', kind: 'train', weight: 14 },
  { id: 'lucky-egg', kind: 'train', weight: 8 },
  // transformations (rare)
  { id: 'mega-stone', kind: 'transform', weight: 2 },
  { id: 'dynamax-band', kind: 'transform', weight: 2 },
  { id: 'star-core', kind: 'transform', weight: 2 },
  { id: 'tera-orb', kind: 'transform', weight: 2 },
  // card protection (see grading.ts)
  { id: 'sleeve', kind: 'protect', weight: 12 },
  { id: 'toploader', kind: 'protect', weight: 6 },
] as const;

export type ItemId = (typeof ITEM_LIST)[number]['id'];
export type ItemKind = (typeof ITEM_LIST)[number]['kind'];

export const ITEM_IDS: ItemId[] = ITEM_LIST.map(i => i.id);
export const isItemId = (s: unknown): s is ItemId => typeof s === 'string' && (ITEM_IDS as string[]).includes(s);
export const kindOf = (id: ItemId): ItemKind => ITEM_LIST.find(i => i.id === id)!.kind;

/** Price of a mystery box in coins. */
export const BOX_PRICE = 120;

/** Weighted pick of a box's content. Luck makes the rare transformation items more likely (+20% per level). */
export function rollBox(luck = 0, rng: () => number = Math.random): ItemId {
  const weights = ITEM_LIST.map(i => [i.id, i.weight * (i.kind === 'transform' ? 1 + 0.2 * luck : 1)] as const);
  let r = rng() * weights.reduce((sum, [, w]) => sum + w, 0);
  for (const [id, w] of weights) { if ((r -= w) < 0) { return id; } }
  return weights[weights.length - 1][0];
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
