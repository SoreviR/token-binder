// Card game engine: packs → cards with rarity → token-based training → evolution/graduation.
// Pure, with no VS Code or network dependencies (the network comes in through injected functions) so it can be tested.
import { BOX_PRICE, ItemId, baseName, branchItem, rollBox } from './items';

/** TCGdex rarities grouped by tier (0 = most common … 6 = rarest). Display names live in the i18n dictionaries (`tier.N`). */
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

/* ───────── Eras: which cards can come out of a pack ───────── */

export type Era = 'vintage' | 'classic' | 'bwxy' | 'modern' | 'current';

export interface EraDef {
  id: Era;
  series: string[];                 // TCGdex series that belong to the era
  holoOnly: boolean;                // only cards with a holo variant (in vintage the rarity just says "Rare")
  rarities: [rarity: string, weight: number][];  // rarities that can come out in this era
}

/**
 * "Premium" filter: old eras only produce holographic cards; the more modern the era, the higher the minimum
 * rarity (no commons or plain rarities). Assorted promos, TCG Pocket and kits are excluded.
 */
export const ERAS: EraDef[] = [
  { id: 'vintage', series: ['base', 'gym', 'neo', 'lc', 'ecard'], holoOnly: true,
    rarities: [['Rare', 1], ['Holo Rare', 1], ['Rare Holo', 1]] },
  { id: 'classic', series: ['ex', 'dp', 'pl', 'hgss', 'col'], holoOnly: true,
    rarities: [['Rare', 3], ['Holo Rare', 3], ['Rare Holo', 3], ['Rare Holo LV.X', 2], ['Rare PRIME', 2], ['LEGEND', 1], ['Ultra Rare', 2]] },
  { id: 'bwxy', series: ['bw', 'xy'], holoOnly: false,
    rarities: [['Ultra Rare', 9], ['Secret Rare', 1], ['Black White Rare', 1]] },
  { id: 'modern', series: ['sm', 'swsh'], holoOnly: false,
    rarities: [['Ultra Rare', 4], ['Holo Rare V', 3], ['Holo Rare VMAX', 2], ['Holo Rare VSTAR', 2], ['Secret Rare', 2], ['Radiant Rare', 1],
      ['Amazing Rare', 1], ['Shiny rare V', 1], ['Shiny rare VMAX', 1], ['Illustration rare', 1]] },
  { id: 'current', series: ['sv', 'me'], holoOnly: false,
    rarities: [['Illustration rare', 5], ['Ultra Rare', 3], ['Special illustration rare', 3], ['Hyper rare', 2], ['Mega Hyper Rare', 1],
      ['Shiny Ultra Rare', 1], ['Mega Attack Rare', 1]] },
];
export const ERA_BY_ID = Object.fromEntries(ERAS.map(e => [e.id, e])) as Record<Era, EraDef>;

export function eraOfSerie(serie: string): Era | undefined {
  return ERAS.find(e => e.series.includes(serie))?.id;
}

/** Does the card pass the premium filter of its era? (Used to pick evolutions well.) */
export function isPremium(c: Pick<Card, 'era' | 'rarity' | 'holo'>): boolean {
  if (!c.era) { return false; }
  const e = ERA_BY_ID[c.era];
  return e.rarities.some(([r]) => r.toLowerCase() === c.rarity.toLowerCase()) && (!e.holoOnly || !!c.holo);
}

export type Variant = 'shadowless' | 'first';

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
  shadowless?: boolean; // this card exists as Shadowless (Base Set only)
  attacks?: Attack[];   // attacks with the base damage already converted to a number (for combat stats)
  weak?: string[];      // types it is weak to
  resist?: string[];    // types it resists
  retreat?: number;     // retreat cost
  price?: Price;        // approximate market value
  priceAt?: number;     // when the price was last fetched
  cv?: number;          // version of the stored data (2 = includes attacks and price)
  variant?: Variant;    // variant of this particular copy
  image: string;        // base URL on assets.tcgdex.net (/low.webp or /high.webp is appended)
}

export interface Attack { name: string; damage: number; cost: number }
export interface Price { eur?: number; usd?: number }
export const CARD_DATA_VERSION = 2;
/** Version of the saved/exported progress format. Only raise it for changes that older versions cannot read; new fields get defaults in `normalize()`. */
export const STATE_SCHEMA = 1;

/** Unique key of a copy: the same id with another variant is a different card in the album. */
export const keyOf = (c: Pick<Card, 'id' | 'variant'>): string => (c.variant ? `${c.id}#${c.variant}` : c.id);

export interface Owned {
  card: Card; count: number; firstAt: number;
  xp: number;           // total tokens this card has trained (inherited on evolution)
  mastered?: boolean;   // already completed its evolutionary line
  care?: { sleeve?: boolean; toploader?: boolean };   // protection applied (improves the odds when grading)
  grade?: number;       // 1-10, from the grading service (never goes down)
  wear?: number;        // 0-4 wear from battles (0 = Mint); a graded card sits in its slab and does not wear
  soaked?: boolean;     // caught in the rain (see mishaps.ts): worthless and unusable until a hair dryer dries it
  tries?: number;       // how many times it has been graded (re-submissions cost more)
  grading?: { since: number; cost: number };         // out for grading: lifetime tokens when it left, fee paid
}
export interface Training {
  card: Card; born: number; evolved: number;
  last: number;         // lifetime tokens up to which XP has already been granted
  mastered?: boolean;   // line complete: stays in the slot earning XP until you retire it
  pending?: string[];   // the line branches: species the player has to choose from (evolution waits)
  pick?: string;        // the chosen species; applied on the next evolution step
  boost?: number;       // tokens left at double XP (Lucky Egg)
}
export interface BattleEntry { at: number; leader: string; card: string; won: boolean; rounds: number; coins: number }
export interface BattleRecord {
  wins: number; losses: number;
  streak: number;                          // current win streak
  best: number;                            // longest win streak
  badges: string[];                        // gym leaders beaten at least once
  daily: { day: string; rewarded: number };  // rematch rewards already given today
  history: BattleEntry[];                  // most recent first, last 20
}
export const newBattleRecord = (): BattleRecord => ({ wins: 0, losses: 0, streak: 0, best: 0, badges: [], daily: { day: '', rewarded: 0 }, history: [] });

export interface GameState {
  v: 2;
  baseline: number;       // lifetime tokens at the start: packs are counted from here
  packsGranted: number;   // packs already granted for tokens
  packs: number;          // unopened regular packs
  premium: number;        // unopened premium packs
  balls: number;          // unopened Poké Balls (1 card)
  collection: Record<string, Owned>;
  slots: (Training | null)[];
  mastered: number;       // cards that completed their evolutionary line
  bonusPeriod: number;    // quota period in which the pack for reaching 100% was already given
  coins: number;          // coins (with decimals; shown rounded down)
  lastLifetime: number;   // lifetime tokens at the last coin count
  luck: number;           // luck upgrade level (0-5)
  boxes: number;          // unopened mystery boxes
  fighter?: string;       // key of the card taken to battles
  battle?: BattleRecord;  // record, badges and recent fights
  items: Partial<Record<ItemId, number>>;   // item inventory
  mishapPeriod?: number;  // quota period in which the mishap for going over 100% already happened
  stolen?: Owned[];       // cards Team Rocket took, oldest first: each win against them brings one back
}

/* ───────── Packs ───────── */

export type PackKind = 'pack' | 'premium' | 'ball';

type EraWeights = Record<Era, number>;
/** Era weights for a normal card, for the "star" card, and for the last cards of a premium pack. */
const BASE_W: EraWeights = { vintage: 34, classic: 28, bwxy: 16, modern: 14, current: 8 };
const HIT_W: EraWeights = { vintage: 14, classic: 20, bwxy: 20, modern: 26, current: 20 };
const TOP_W: EraWeights = { vintage: 8, classic: 12, bwxy: 20, modern: 30, current: 30 };

export function pickWeighted<T>(items: [T, number][], rng: () => number = Math.random): T {
  let r = rng() * items.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of items) { if ((r -= w) < 0) { return v; } }
  return items[items.length - 1][0];
}

/** The luck upgrade adds +20% per level to the weight of the modern eras (the rarest). */
export function pickEra(w: EraWeights, luck = 0, rng: () => number = Math.random): Era {
  const boost = 1 + 0.2 * luck;
  return pickWeighted(ERAS.map(e => [e.id, w[e.id] * (e.id === 'modern' || e.id === 'current' ? boost : 1)] as [Era, number]), rng);
}

/** The era each card of a pack of that kind asks for. */
export function rollEras(kind: PackKind, luck = 0, rng: () => number = Math.random): Era[] {
  const slots = kind === 'pack' ? [BASE_W, HIT_W]
    : kind === 'premium' ? [HIT_W, TOP_W] : [BASE_W];
  return slots.map(w => pickEra(w, luck, rng));
}

/** Rarities within an era in weighted random order (to try the next one if some has no cards). */
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

/** Shadowless / 1st Edition Shadowless variant (only exists for Base Set cards). Luck favors it. */
export function rollVariant(card: Pick<Card, 'shadowless'>, luck = 0, rng: () => number = Math.random): Variant | undefined {
  if (!card.shadowless) { return undefined; }
  const m = 1 + 0.2 * luck;
  const r = rng();
  if (r < 0.06 * m) { return 'first'; }
  if (r < 0.06 * m + 0.24 * m) { return 'shadowless'; }
  return undefined;
}

/* ───────── Entrenamiento ───────── */

/** Tokens each stage lasts before evolving (growth.multiplier is applied). */
const STAGE_TOKENS = [1_500_000, 4_500_000, 6_000_000, 8_000_000];

/** Accumulated tokens (since training began) at which stage k ends. */
export function stageEnd(k: number, mult: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) { sum += STAGE_TOKENS[Math.min(i, STAGE_TOKENS.length - 1)]; }
  return Math.round(sum * mult);
}

export interface TrainingProgress { into: number; span: number; pct: number; due: boolean }

export function trainingProgress(t: Training, lifetime: number, mult: number): TrainingProgress {
  if (t.mastered) { return { into: 0, span: 1, pct: 100, due: false }; }
  const acc = Math.max(0, lifetime - t.born);
  const start = t.evolved === 0 ? 0 : stageEnd(t.evolved - 1, mult);
  const end = stageEnd(t.evolved, mult);
  return { into: Math.min(acc - start, end - start), span: end - start, pct: Math.min(100, ((acc - start) / (end - start)) * 100), due: acc >= end };
}

/* ───────── Level ───────── */

export const XP_PER_LEVEL = 400_000;
export const MAX_LEVEL = 50;
/** Level of a card from the tokens it has trained (1-50; about 20M tokens for the maximum). */
export const levelOf = (xp: number): number => Math.min(MAX_LEVEL, 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL));
/** Progress towards the next level (null at the maximum level). */
export function levelProgress(xp: number): { level: number; into: number; span: number; pct: number } | null {
  const level = levelOf(xp);
  if (level >= MAX_LEVEL) { return null; }
  const into = xp - (level - 1) * XP_PER_LEVEL;
  return { level, into, span: XP_PER_LEVEL, pct: (into / XP_PER_LEVEL) * 100 };
}

/** Grants the cards in training the tokens used since the last time. Returns the level-ups. */
export function accrueXp(s: GameState, lifetime: number): string[] {
  const events: string[] = [];
  for (const t of s.slots) {
    if (!t) { continue; }
    const delta = Math.max(0, lifetime - t.last);
    t.last = lifetime;
    const o = s.collection[keyOf(t.card)];
    if (!o || !delta) { continue; }
    const before = levelOf(o.xp);
    const doubled = Math.min(delta, t.boost ?? 0);   // Lucky Egg: those tokens count twice
    if (doubled > 0) { t.boost = (t.boost ?? 0) - doubled; if (t.boost <= 0) { delete t.boost; } }
    o.xp += delta + doubled;
    if (levelOf(o.xp) > before) { events.push(`level:${t.card.name}:${levelOf(o.xp)}`); }
  }
  return events;
}

/* ───────── State ───────── */

export function newState(lifetime: number): GameState {
  // A welcome pack so there is something to open from the very first moment.
  return {
    v: 2, baseline: lifetime, packsGranted: 0, packs: 1, premium: 0, balls: 0, collection: {}, slots: [null], mastered: 0,
    bonusPeriod: 0, coins: 0, lastLifetime: lifetime, luck: 0, boxes: 0, items: {}, battle: newBattleRecord(),
  };
}

/** Fills in the fields added in newer versions to a previously saved state (without giving retroactive coins). */
export function normalize(s: GameState, lifetime: number): GameState {
  s.premium ??= 0; s.balls ??= 0; s.coins ??= 0; s.luck ??= 0; s.lastLifetime ??= lifetime; s.boxes ??= 0; s.items ??= {}; s.battle ??= newBattleRecord();
  for (const o of Object.values(s.collection)) { o.xp ??= 0; }
  // Cards that were already training receive the XP of everything trained so far (since they entered the slot).
  for (const t of s.slots) { if (t) { t.last ??= t.born; } }
  return s;
}

/* ───────── Coins and shop ───────── */

export const COIN_EVERY_TOKENS = 10_000;
export const PACE_BONUS = 1.2;
export const MAX_SLOTS = 6;
export const MAX_LUCK = 5;

/** Are you under the quota pace? (% used ≤ % of the period elapsed.) */
export function underPace(quotaPct: number, now: number, start: number, end: number): boolean {
  if (end <= start) { return false; }
  const elapsed = Math.min(1, Math.max(0, (now - start) / (end - start)));
  return quotaPct <= elapsed * 100;
}

/** Adds the coins for the tokens used since the last time. Returns how many were earned. */
export function earnCoins(s: GameState, lifetime: number, bonus: boolean): number {
  const delta = Math.max(0, lifetime - s.lastLifetime);
  s.lastLifetime = lifetime;
  const earned = (delta / COIN_EVERY_TOKENS) * (bonus ? PACE_BONUS : 1);
  s.coins += earned;
  return earned;
}

export type Item = 'pack' | 'premium' | 'ball' | 'box' | 'sleeve' | 'toploader' | 'hair-dryer' | 'slot' | 'luck';

const SLOT_PRICES = [400, 900, 1600, 2600, 4000];   // slots 2 to 6
const LUCK_PRICES = [300, 600, 1200, 2400, 4800];   // levels 1 to 5
const FIXED_PRICES: Record<'pack' | 'premium' | 'ball' | 'box' | 'sleeve' | 'toploader' | 'hair-dryer', number> = { pack: 80, premium: 250, ball: 15, box: BOX_PRICE, sleeve: 15, toploader: 50, 'hair-dryer': 40 };

/** Current price of an item, or null if the maximum was already bought. */
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
  else if (item === 'box') { s.boxes++; }
  else if (item === 'sleeve' || item === 'toploader' || item === 'hair-dryer') { grantItem(s, item); }
  else if (item === 'slot') { s.slots.push(null); }
  else { s.luck++; }
  return true;
}

/** Takes a pack/Poké Ball out of the inventory. Returns false if there is none. */
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
    if (o) { o.count++; } else { s.collection[k] = { card: c, count: 1, firstAt: now, xp: 0 }; }
  }
}

/** Coins for selling a duplicate copy: by rarity tier, with a bonus for Shadowless variants. */
const SELL_VALUE = [3, 6, 12, 30, 70, 160, 400];
export function sellValue(c: Pick<Card, 'tier' | 'variant'>): number {
  return SELL_VALUE[c.tier] * (c.variant === 'first' ? 5 : c.variant === 'shadowless' ? 2 : 1);
}

/** Sells duplicate copies (you always keep one). With `key`, only that card. Soaked cards are worthless and stay. Returns the coins earned. */
export function sellDuplicates(s: GameState, key?: string): number {
  let earned = 0;
  for (const [k, o] of Object.entries(s.collection)) {
    if ((key !== undefined && k !== key) || o.soaked) { continue; }
    if (o.count > 1) { earned += (o.count - 1) * sellValue(o.card); o.count = 1; }
  }
  s.coins += earned;
  return earned;
}

/** Puts a card from the collection into a free slot to train. Returns false if it cannot be done. */
export function startTraining(s: GameState, cardId: string, lifetime: number): boolean {
  const owned = s.collection[cardId];
  const slot = s.slots.findIndex(x => x === null);
  if (!owned || slot < 0 || owned.grading || owned.soaked) { return false; }   // a card out for grading or soaked cannot train
  if (s.slots.some(t => t && keyOf(t.card) === cardId)) { return false; }
  // A card that already completed its line goes back into the slot to keep leveling up.
  s.slots[slot] = { card: owned.card, born: lifetime, evolved: 0, last: lifetime, mastered: owned.mastered || undefined };
  return true;
}

/** Removes a card from its slot (it keeps its level and XP). */
export function untrain(s: GameState, key: string): boolean {
  const i = s.slots.findIndex(t => t && keyOf(t.card) === key);
  if (i < 0) { return false; }
  s.slots[i] = null;
  return true;
}

/** Result of looking up the next card of a line: the card, null when the line is over, the species to choose from when it branches, or a network failure. */
export type NextResult = { ok: true; card: Card | null } | { ok: true; branches: string[] } | { ok: false };
/** `pick` is the species chosen for a branching line. */
export type FindNext = (card: Card, pick?: string) => Promise<NextResult>;

/**
 * Resolves the completed stages: evolves into the next card or, if the line is over, graduates the card
 * (+1 pack). If the lookup fails because of the network (ok:false) nothing is touched and it is retried later.
 */
export async function resolveDue(s: GameState, lifetime: number, mult: number, findNext: FindNext, now = Date.now()): Promise<string[]> {
  accrueXp(s, lifetime);   // the level-up notice is raised by whoever calls accrueXp (tick); this only makes sure the XP is in before evolving
  const events: string[] = [];
  for (let i = 0; i < s.slots.length; i++) {
    for (let guard = 0; guard < 10; guard++) {
      const t = s.slots[i];
      if (!t || t.mastered || !trainingProgress(t, lifetime, mult).due) { break; }
      if (t.pending && !t.pick) { break; }              // waiting for the player to choose a branch
      const r = await findNext(t.card, t.pick);
      if (!r.ok) { break; }
      if ('branches' in r) {
        t.pending = r.branches;
        events.push(`branch:${t.card.name}`);
        break;
      }
      if (r.card) {
        addCards(s, [r.card], now);
        // The new card inherits the level of the previous one.
        const next = s.collection[keyOf(r.card)], prev = s.collection[keyOf(t.card)];
        if (next && prev) { next.xp = Math.max(next.xp, prev.xp); }
        s.slots[i] = { card: r.card, born: t.born, evolved: t.evolved + 1, last: t.last, ...(t.boost ? { boost: t.boost } : {}) };
        events.push(`evolve:${r.card.name}`);
      } else {
        // The card stays in the slot as a "Master" and keeps earning XP (levels) until you retire it.
        s.slots[i] = { ...t, mastered: true };
        const own = s.collection[keyOf(t.card)];
        if (own) { own.mastered = true; }
        s.mastered++;
        s.packs++;
        events.push(`graduate:${t.card.name}`);
      }
    }
  }
  return events;
}

/* ───────── Items ───────── */

export const LUCKY_EGG_TOKENS = 1_000_000;   // tokens that count double after using a Lucky Egg

export const countOf = (s: GameState, id: ItemId): number => s.items[id] ?? 0;
export function grantItem(s: GameState, id: ItemId, n = 1): void { s.items[id] = countOf(s, id) + n; }
/** Takes one item out of the inventory. Returns false if there is none. */
export function takeItem(s: GameState, id: ItemId): boolean {
  const n = countOf(s, id);
  if (n < 1) { return false; }
  if (n === 1) { delete s.items[id]; } else { s.items[id] = n - 1; }
  return true;
}

/** Opens a mystery box: returns the item found, or null if there is no box. */
export function openBox(s: GameState, rng: () => number = Math.random): ItemId | null {
  if (s.boxes < 1) { return null; }
  s.boxes--;
  const id = rollBox(s.luck, rng);
  grantItem(s, id);
  return id;
}

/** Rare Candy: the card jumps to the next level (the XP of that level's start). false if there is none or the card is at the maximum. */
export function useRareCandy(s: GameState, key: string): boolean {
  const o = s.collection[key];
  if (!o || levelOf(o.xp) >= MAX_LEVEL || countOf(s, 'rare-candy') < 1) { return false; }
  takeItem(s, 'rare-candy');
  o.xp = levelOf(o.xp) * XP_PER_LEVEL;
  return true;
}

/** Lucky Egg: the next 1M tokens give double XP to a card that is in training. */
export function useLuckyEgg(s: GameState, key: string): boolean {
  const t = s.slots.find(x => x && keyOf(x.card) === key);
  if (!t || !takeItem(s, 'lucky-egg')) { return false; }
  t.boost = (t.boost ?? 0) + LUCKY_EGG_TOKENS;
  return true;
}

export type ChooseResult = { ok: true; name: string } | { ok: false; reason: 'none' | 'invalid' | 'item' };

/**
 * Resolves a branching evolution that is waiting for the player. `choice` is a species name (needs its item when that
 * branch has one) or 'natural' (a random branch, free). The evolution itself happens on the next `resolveDue`.
 */
export function chooseEvolution(s: GameState, key: string, choice: string | 'natural', rng: () => number = Math.random): ChooseResult {
  const t = s.slots.find(x => x && keyOf(x.card) === key);
  if (!t?.pending?.length) { return { ok: false, reason: 'none' }; }
  let name = choice;
  if (choice === 'natural') {
    name = t.pending[Math.floor(rng() * t.pending.length)];
  } else {
    if (!t.pending.includes(choice)) { return { ok: false, reason: 'invalid' }; }
    const need = branchItem(t.card.name, choice);
    if (need && !takeItem(s, need)) { return { ok: false, reason: 'item' }; }
  }
  t.pick = name;
  delete t.pending;
  return { ok: true, name };
}

/**
 * Transformation (Mega, VMAX…): the card found replaces the old one. It keeps its level, counts as finished and, if the old
 * card was training, takes its slot. The caller has already looked the card up; the item is only spent here.
 */
export function applyTransform(s: GameState, key: string, item: ItemId, newCard: Card, now = Date.now()): string | null {
  const prev = s.collection[key];
  if (!prev || countOf(s, item) < 1 || keyOf(newCard) === key) { return null; }
  takeItem(s, item);
  addCards(s, [newCard], now);
  const nk = keyOf(newCard);
  const next = s.collection[nk];
  next.xp = Math.max(next.xp, prev.xp);
  next.mastered = true;
  for (let i = 0; i < s.slots.length; i++) {
    const t = s.slots[i];
    if (t && keyOf(t.card) === key) { s.slots[i] = { ...t, card: newCard, mastered: true, pending: undefined, pick: undefined }; }
  }
  return nk;
}

/** Species a line can branch into, for the UI: each with the item that picks it (if any). */
export function branchOptions(t: Training): { name: string; item?: ItemId }[] {
  return (t.pending ?? []).map(name => ({ name, item: branchItem(t.card.name, name) }));
}
export { baseName };
