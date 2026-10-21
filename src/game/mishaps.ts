// Mishaps for going over the monthly quota: once per quota period, past 100%, something bad happens to the album.
// Team Rocket steals a card (it can be won back in a battle), you trip and drop some cards, or it rains and soaks half of
// the album (a Charmandryer, the hair dryer of the shop, saves a soaked card). Opt-in through `tokenBinder.mishaps.enabled`. Pure: no VS Code, no network.
import { Card, GameState, Owned, keyOf, takeItem } from './engine';
import { MAX_WEAR } from './grading';
import { HISTORY_SIZE, LeaderDef, battleOf } from './leaders';

export type MishapKind = 'rocket' | 'trip' | 'rain';

/** How likely each mishap is once it is decided that one happens: Team Rocket is common, the rain is rare. */
export const MISHAPS: [MishapKind, number][] = [['rocket', 60], ['trip', 30], ['rain', 10]];
export const TRIP_SHARE = 0.1;    // share of the album's copies that fall when you trip
export const RAIN_SHARE = 0.5;    // share of the album's cards the rain reaches (a sleeve or a slab keeps them dry)

export interface MishapResult {
  kind: MishapKind;
  cards: { key: string; name: string; n: number }[];   // cards affected (n = copies lost, or 1 for a stolen or soaked card)
  saved: number;                                       // cards the rain reached that a sleeve or a slab kept dry
}

/** Team Rocket's ace when you go to win a card back: about as tough as the third gym leader, with no reward but the card. */
export const ROCKET: LeaderDef = { id: 'rocket', name: 'Team Rocket', species: 'Arbok', level: 15, demand: 2, reward: 0, rematch: 0 };

export function rollMishap(rng: () => number = Math.random): MishapKind {
  let r = rng() * MISHAPS.reduce((sum, [, w]) => sum + w, 0);
  for (const [k, w] of MISHAPS) { if ((r -= w) < 0) { return k; } }
  return MISHAPS[MISHAPS.length - 1][0];
}

/** Copies of a card that are in the album: the one training goes with you and the one at the grading service is not home. */
function inAlbum(s: GameState, key: string, o: Owned): number {
  const training = s.slots.some(t => t && keyOf(t.card) === key);
  return Math.max(0, o.count - (training ? 1 : 0) - (o.grading ? 1 : 0));
}

function shuffle<T>(a: T[], rng: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Takes one copy out of the collection; the card disappears with its last copy (and stops being the battle card). */
function removeCopy(s: GameState, key: string): void {
  const o = s.collection[key];
  if (!o) { return; }
  if (--o.count > 0) { return; }
  delete s.collection[key];
  if (s.fighter === key) { delete s.fighter; }
}

/** Every copy in the album, once per copy, optionally only from the cards that pass `keep`. */
function copies(s: GameState, keep: (o: Owned) => boolean = () => true): string[] {
  return Object.entries(s.collection).flatMap(([k, o]) => (keep(o) ? new Array<string>(inAlbum(s, k, o)).fill(k) : []));
}

function tally(keys: string[], s: GameState, names: Record<string, string>): MishapResult['cards'] {
  const n = new Map<string, number>();
  for (const k of keys) { n.set(k, (n.get(k) ?? 0) + 1); }
  return [...n].map(([key, count]) => ({ key, name: names[key] ?? s.collection[key]?.card.name ?? key, n: count }));
}

/** Team Rocket takes one random copy (any copy is as likely). The card is kept so it can be won back. */
export function rocketSteal(s: GameState, rng: () => number = Math.random): MishapResult | null {
  const pool = copies(s);
  if (!pool.length) { return null; }
  const key = pool[Math.floor(rng() * pool.length)];
  const o = s.collection[key];
  (s.stolen ??= []).push({ ...JSON.parse(JSON.stringify(o)) as Owned, count: 1 });
  removeCopy(s, key);
  return { kind: 'rocket', cards: [{ key, name: o.card.name, n: 1 }], saved: 0 };
}

/** You trip and 10% of the copies in the album fall and are lost (at least one). Graded cards are safe in their slab. */
export function tripAndDrop(s: GameState, rng: () => number = Math.random): MishapResult | null {
  const pool = shuffle(copies(s, o => !o.grade), rng);
  if (!pool.length) { return null; }
  const lost = pool.slice(0, Math.max(1, Math.round(pool.length * TRIP_SHARE)));
  const names = Object.fromEntries(lost.map(k => [k, s.collection[k].card.name]));
  for (const k of lost) { removeCopy(s, k); }
  return { kind: 'trip', cards: tally(lost, s, names), saved: 0 };
}

/** It rains on half of the album's cards. A sleeve or a slab keeps a card dry; the rest end up soaked (all their copies). */
export function rainSoak(s: GameState, rng: () => number = Math.random): MishapResult | null {
  const pool = shuffle(Object.keys(s.collection).filter(k => !s.collection[k].soaked && inAlbum(s, k, s.collection[k]) > 0), rng);
  if (!pool.length) { return null; }
  const reached = pool.slice(0, Math.max(1, Math.round(pool.length * RAIN_SHARE)));
  const wet = reached.filter(k => !s.collection[k].care?.sleeve && !s.collection[k].grade);
  for (const k of wet) { s.collection[k].soaked = true; }
  return { kind: 'rain', cards: tally(wet, s, {}), saved: reached.length - wet.length };
}

/**
 * Called on every refresh: past 100% of the quota, the first time in a quota period, one mishap happens. Returns it, or
 * null when nothing happened (under the quota, already happened this period, or an empty album).
 */
export function overageMishap(s: GameState, quotaPct: number, period: number, rng: () => number = Math.random): MishapResult | null {
  if (quotaPct <= 100 || s.mishapPeriod === period) { return null; }
  s.mishapPeriod = period;
  const kind = rollMishap(rng);
  return kind === 'rocket' ? rocketSteal(s, rng) : kind === 'trip' ? tripAndDrop(s, rng) : rainSoak(s, rng);
}

/** Charmandryer (the hair dryer): a soaked card dries but stays warped (the worst condition). Spends one dryer. */
export function dryCard(s: GameState, key: string): boolean {
  const o = s.collection[key];
  if (!o?.soaked || !takeItem(s, 'hair-dryer')) { return false; }
  delete o.soaked;
  o.wear = MAX_WEAR;
  return true;
}

/** Gives back the card Team Rocket took first: another copy if you still have the card, otherwise the card as it was. */
export function recoverStolen(s: GameState, now = Date.now()): Card | null {
  const back = s.stolen?.shift();
  if (!back) { return null; }
  if (!s.stolen!.length) { delete s.stolen; }
  const key = keyOf(back.card);
  const o = s.collection[key];
  if (o) { o.count++; } else { s.collection[key] = { ...back, firstAt: back.firstAt ?? now }; }
  return back.card;
}

/** Records a fight against Team Rocket: it counts in the record like any battle, pays no coins and a win brings a card back. */
export function recordRocketBattle(s: GameState, cardName: string, won: boolean, rounds: number, now = Date.now()): Card | null {
  const b = battleOf(s);
  if (won) { b.wins++; b.streak++; b.best = Math.max(b.best, b.streak); } else { b.losses++; b.streak = 0; }
  b.history = [{ at: now, leader: ROCKET.id, card: cardName, won, rounds, coins: 0 }, ...b.history].slice(0, HISTORY_SIZE);
  return won ? recoverStolen(s, now) : null;
}
