// One-versus-one battle simulator. Pure and deterministic: the same two fighters and the same seed always give the same
// fight, so a result can be replayed (and, later, verified by a server). No VS Code, no network.
import type { Card } from './engine';
import { HELD_EFFECTS, HeldId } from './items';
import { StrengthBreakdown, StrengthOptions, combatStats } from './strength';

/** Version of the battle rules. Anything that compares or replays fights must check it matches. */
export const BATTLE_VERSION = 2;

export const MAX_ROUNDS = 40;
export const WEAKNESS_MULT = 1.15;
export const RESIST_MULT = 0.92;
export const CRIT_CHANCE = 0.12;
export const CRIT_MULT = 1.6;
export const MISS_CHANCE = 0.1;

export interface Move { name: string; power: number; weight: number }

export interface Fighter {
  key: string;
  name: string;
  types: string[];
  weak: string[];
  resist: string[];
  level: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  moves: Move[];
  crit: number;          // chance of a critical hit
  miss: number;          // chance of missing
  held?: HeldId;
  strength: StrengthBreakdown;
}

/**
 * The card's real attacks as moves: weaker attacks hit softer and are picked less often. Powers are rescaled so that the
 * AVERAGE move of every card is exactly 1.0: a card with one big attack and a card with three small ones deal the same
 * damage on average, they just spread it differently.
 */
export function movesOf(card: Pick<Card, 'attacks'>): Move[] {
  const attacks = (card.attacks ?? []).filter(a => a && a.name);
  if (!attacks.length) { return [{ name: 'Tackle', power: 1, weight: 10 }]; }
  const top = Math.max(0, ...attacks.map(a => a.damage));
  const raw = attacks.map(a => ({ name: a.name, power: top > 0 ? 0.6 + 0.4 * (a.damage / top) : 1, weight: a.damage + 10 }));
  const total = raw.reduce((s, m) => s + m.weight, 0);
  const mean = raw.reduce((s, m) => s + m.power * m.weight, 0) / total;
  return raw.map(m => ({ ...m, power: m.power / mean }));
}

/** Builds a fighter from a card, the XP it has trained and the optional bonuses (and the item it holds). */
export function makeFighter(key: string, card: Card, xp: number, opts: StrengthOptions & { held?: HeldId } = {}): Fighter {
  const { stats, strength } = combatStats(card, xp, opts);
  const h = opts.held ? HELD_EFFECTS[opts.held] : undefined;
  return {
    key, name: card.name, types: card.types ?? [], weak: card.weak ?? [], resist: card.resist ?? [],
    level: stats.level,
    hp: Math.round(stats.hp * (h?.hp ?? 1)), atk: Math.round(stats.atk * (h?.atk ?? 1) * 100) / 100, def: stats.def, spd: Math.round(stats.spd * (h?.spd ?? 1)),
    moves: movesOf(card), crit: CRIT_CHANCE + (h?.crit ?? 0), miss: MISS_CHANCE + (h?.miss ?? 0), held: opts.held, strength,
  };
}

/* ───────── Random numbers ───────── */

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────── Fight ───────── */

export type Side = 'a' | 'b';
export type Effectiveness = 'weak' | 'resist';

export type BattleEvent =
  | { t: 'start'; a: { name: string; hp: number }; b: { name: string; hp: number } }
  | { t: 'attack'; round: number; side: Side; move: string; dmg: number; crit: boolean; miss: boolean; eff?: Effectiveness; hp: { a: number; b: number } }
  | { t: 'end'; winner: Side; rounds: number; reason: 'ko' | 'timeout'; hp: { a: number; b: number } };

export interface BattleResult {
  version: number;
  winner: Side;
  rounds: number;
  reason: 'ko' | 'timeout';
  log: BattleEvent[];
  hpLeft: { a: number; b: number };
}

function pickMove(f: Fighter, rng: () => number): Move {
  let r = rng() * f.moves.reduce((s, m) => s + m.weight, 0);
  for (const m of f.moves) { if ((r -= m.weight) < 0) { return m; } }
  return f.moves[f.moves.length - 1];
}

/** How much the attacker's type matters against the defender: x1.25 against a weakness, x0.8 against a resistance. */
export function effectiveness(attacker: Fighter, defender: Fighter): { mult: number; eff?: Effectiveness } {
  const type = attacker.types[0];
  if (type && defender.weak.includes(type)) { return { mult: WEAKNESS_MULT, eff: 'weak' }; }
  if (type && defender.resist.includes(type)) { return { mult: RESIST_MULT, eff: 'resist' }; }
  return { mult: 1 };
}

export function simulate(a: Fighter, b: Fighter, seed: number): BattleResult {
  const rng = mulberry32(seed);
  const hp = { a: Math.max(1, a.hp), b: Math.max(1, b.hp) };
  const max = { a: hp.a, b: hp.b };
  const fighters = { a, b };
  const log: BattleEvent[] = [{ t: 'start', a: { name: a.name, hp: hp.a }, b: { name: b.name, hp: hp.b } }];
  let rounds = 0;
  let winner: Side | undefined;
  let reason: 'ko' | 'timeout' = 'ko';

  while (!winner && rounds < MAX_ROUNDS) {
    rounds++;
    // Who acts first changes every round, weighted by speed: speed helps a little but never decides a fight on its own.
    const first: Side = rng() < a.spd / (a.spd + b.spd) ? 'a' : 'b';
    for (const side of [first, first === 'a' ? 'b' : 'a'] as Side[]) {
      const me = fighters[side], foe = fighters[side === 'a' ? 'b' : 'a'], foeSide: Side = side === 'a' ? 'b' : 'a';
      const move = pickMove(me, rng);
      const miss = rng() < me.miss;
      const crit = !miss && rng() < me.crit;
      const variance = 0.3 + 0.7 * rng();
      const { mult, eff } = effectiveness(me, foe);
      let dmg = 0;
      if (!miss) { dmg = Math.max(1, Math.round(me.atk * move.power * (100 / (100 + foe.def)) * variance * mult * (crit ? CRIT_MULT : 1))); }
      hp[foeSide] = Math.max(0, hp[foeSide] - dmg);
      log.push({ t: 'attack', round: rounds, side, move: move.name, dmg, crit, miss, ...(eff && !miss ? { eff } : {}), hp: { ...hp } });
      if (hp[foeSide] <= 0) { winner = side; break; }
    }
  }
  if (!winner) {
    reason = 'timeout';
    const pa = hp.a / max.a, pb = hp.b / max.b;
    winner = pa === pb ? (rng() < 0.5 ? 'a' : 'b') : pa > pb ? 'a' : 'b';
  }
  log.push({ t: 'end', winner, rounds, reason, hp: { ...hp } });
  return { version: BATTLE_VERSION, winner, rounds, reason, log, hpLeft: { ...hp } };
}

/** Rough chance (0-1) that `a` beats `b`, by replaying the fight with many seeds. For the "odds" shown before a battle. */
export function estimateWin(a: Fighter, b: Fighter, runs = 400, baseSeed = 7): number {
  let wins = 0;
  for (let i = 0; i < runs; i++) { if (simulate(a, b, baseSeed + i * 7919).winner === 'a') { wins++; } }
  return wins / runs;
}

/* ───────── Why did it go that way? ───────── */

export type FactorId = 'level' | 'demand' | 'rarity' | 'stage' | 'grade' | 'tokens';

/** The strength factors in which two fighters differ most (a / b), for the "why you won" summary. */
export function factorGaps(a: Fighter, b: Fighter): { factor: FactorId; ratio: number }[] {
  const ids: FactorId[] = ['level', 'demand', 'rarity', 'stage', 'grade', 'tokens'];
  return ids.map(factor => ({ factor, ratio: a.strength[factor] / b.strength[factor] }))
    .filter(g => Math.abs(g.ratio - 1) >= 0.005)
    .sort((x, y) => Math.abs(Math.log(y.ratio)) - Math.abs(Math.log(x.ratio)));
}
