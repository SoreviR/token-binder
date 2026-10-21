// Card protection (sleeves, toploaders) and grading ("TBGS", a fictional grading service so no real company is named).
// Pure: no VS Code, no network. A graded card gets a slab, a 1-10 grade and a market value that follows the grade.
import { GameState, countOf, keyOf, takeItem } from './engine';

export type Protector = 'sleeve' | 'toploader';
export const PROTECTORS: Protector[] = ['sleeve', 'toploader'];

/** Tokens a card stays at the grading service before it comes back. */
export const GRADE_TOKENS = 500_000;
/** Base fee in coins by rarity tier (0-6); each re-submission costs one more base fee. */
const GRADE_FEE = [30, 50, 80, 150, 300, 600, 1200];

export const gradeCost = (tier: number, tries: number): number => GRADE_FEE[Math.max(0, Math.min(6, tier))] * (tries + 1);

/** Market value multiplier by grade: a Gem Mint 10 is worth far more than an ungraded card, a poor grade a bit less. */
const GRADE_MULT: Record<number, number> = { 10: 3, 9: 1.8, 8: 1.3, 7: 1.1, 6: 1, 5: 0.9, 4: 0.8, 3: 0.7, 2: 0.6, 1: 0.5 };
export const gradeMultiplier = (grade: number | undefined): number => (grade ? GRADE_MULT[Math.max(1, Math.min(10, Math.round(grade)))] : 1);

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * The grade a submission comes back with. Quality is the average of three dice (so extremes are rare); a sleeve and a
 * toploader shift it up. Without protection a 10 is about 0.5%; with both about 8%.
 */
export function rollGrade(care: { sleeve?: boolean; toploader?: boolean } | undefined, rng: () => number = Math.random): number {
  const q = (rng() + rng() + rng()) / 3 + (care?.sleeve ? 0.08 : 0) + (care?.toploader ? 0.12 : 0);
  return clamp(Math.round(2 + 8 * q), 1, 10);
}

/** Puts a sleeve or a toploader on a card (one of each per card). The item is only spent when it is applied. */
export function protect(s: GameState, key: string, kind: Protector): boolean {
  const o = s.collection[key];
  if (!o || o.care?.[kind] || countOf(s, kind) < 1) { return false; }
  takeItem(s, kind);
  o.care = { ...o.care, [kind]: true };
  return true;
}

export type SendResult = { ok: true; cost: number } | { ok: false; reason: 'none' | 'training' | 'busy' | 'coins' };

/** Sends a card to grading: pays the fee and starts the wait. A card in a training slot has to be retired first. */
export function sendToGrading(s: GameState, key: string, lifetime: number): SendResult {
  const o = s.collection[key];
  if (!o) { return { ok: false, reason: 'none' }; }
  if (o.grading) { return { ok: false, reason: 'busy' }; }
  if (s.slots.some(t => t && keyOf(t.card) === key)) { return { ok: false, reason: 'training' }; }
  const cost = gradeCost(o.card.tier, o.tries ?? 0);
  if (s.coins < cost) { return { ok: false, reason: 'coins' }; }
  s.coins -= cost;
  o.grading = { since: lifetime, cost };
  return { ok: true, cost };
}

/** Tokens left before a card comes back, and the progress of the wait. */
export function gradingProgress(grading: { since: number }, lifetime: number): { into: number; span: number; pct: number } {
  const into = clamp(lifetime - grading.since, 0, GRADE_TOKENS);
  return { into, span: GRADE_TOKENS, pct: (into / GRADE_TOKENS) * 100 };
}

/**
 * Brings back the cards whose wait is over. A re-submission can only improve the grade, never lower it. Events are
 * `graded:<grade>:<1 if better than before, else 0>:<card name>`.
 */
export function resolveGrading(s: GameState, lifetime: number, rng: () => number = Math.random): string[] {
  const events: string[] = [];
  for (const o of Object.values(s.collection)) {
    if (!o.grading || lifetime - o.grading.since < GRADE_TOKENS) { continue; }
    const rolled = rollGrade(o.care, rng);
    const better = rolled > (o.grade ?? 0);
    o.grade = Math.max(o.grade ?? 0, rolled);
    o.tries = (o.tries ?? 0) + 1;
    delete o.grading;
    events.push(`graded:${o.grade}:${better ? 1 : 0}:${o.card.name}`);
  }
  return events;
}
