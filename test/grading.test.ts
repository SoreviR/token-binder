import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card, addCards, buy, countOf, grantItem, newState, startTraining, tierOf } from '../src/game/engine';
import {
  GRADE_TOKENS, gradeCost, gradeMultiplier, gradingProgress, protect, resolveGrading, rollGrade, sendToGrading,
} from '../src/game/grading';

const card = (id: string, name: string, rarity = 'Rare'): Card => ({ id, name, rarity, tier: tierOf(rarity), image: `https://x/${id}` });

/** Small seeded generator so the distribution tests are repeatable. */
function mulberry32(seed: number): () => number {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const sample = (care: { sleeve?: boolean; toploader?: boolean } | undefined, n = 40_000) => {
  const rng = mulberry32(12345);
  const counts = new Array(11).fill(0);
  let sum = 0;
  for (let i = 0; i < n; i++) { const g = rollGrade(care, rng); counts[g]++; sum += g; }
  return { mean: sum / n, p10: counts[10] / n, p1: counts[1] / n, counts };
};

test('rollGrade stays between 1 and 10 and a Gem Mint is rare without protection', () => {
  for (const r of [0, 0.5, 0.999999]) { const g = rollGrade({ sleeve: true, toploader: true }, () => r); assert.ok(g >= 1 && g <= 10); }
  const none = sample(undefined);
  assert.ok(none.p10 < 0.02, `P(10) without protection was ${none.p10}`);
  assert.ok(none.mean > 5.5 && none.mean < 6.5, `mean ${none.mean}`);
  assert.ok(none.counts.slice(1).every(c => c >= 0));
});

test('protection raises the odds: sleeve < toploader < both, and a 10 becomes realistic', () => {
  const none = sample(undefined), sleeve = sample({ sleeve: true }), top = sample({ toploader: true }), both = sample({ sleeve: true, toploader: true });
  assert.ok(none.mean < sleeve.mean && sleeve.mean < top.mean && top.mean < both.mean, [none.mean, sleeve.mean, top.mean, both.mean].join(' < '));
  assert.ok(both.p10 > 0.04 && both.p10 < 0.15, `P(10) with both was ${both.p10}`);
  assert.ok(both.p10 > none.p10 * 5);
});

test('grade multiplier: a 10 is worth far more, poor grades a bit less, ungraded is unchanged', () => {
  assert.equal(gradeMultiplier(undefined), 1);
  assert.equal(gradeMultiplier(10), 3);
  assert.equal(gradeMultiplier(6), 1);
  assert.ok(gradeMultiplier(1) < 1);
  for (let g = 1; g < 10; g++) { assert.ok(gradeMultiplier(g) <= gradeMultiplier(g + 1), `monotonic at ${g}`); }
});

test('grading fee depends on the rarity tier and grows with every re-submission', () => {
  assert.ok(gradeCost(0, 0) < gradeCost(3, 0) && gradeCost(3, 0) < gradeCost(6, 0));
  assert.equal(gradeCost(2, 2), gradeCost(2, 0) * 3);
  assert.equal(gradeCost(99, 0), gradeCost(6, 0));   // out-of-range tiers are clamped
});

test('protect: needs the item, one sleeve and one toploader per card, and spends only when applied', () => {
  const s = newState(0);
  addCards(s, [card('a', 'Charizard')]);
  assert.equal(protect(s, 'a', 'sleeve'), false);                 // no item
  grantItem(s, 'sleeve', 2); grantItem(s, 'toploader');
  assert.equal(protect(s, 'a', 'sleeve'), true);
  assert.equal(protect(s, 'a', 'sleeve'), false);                 // already sleeved: the second sleeve is kept
  assert.equal(countOf(s, 'sleeve'), 1);
  assert.equal(protect(s, 'a', 'toploader'), true);
  assert.deepEqual(s.collection['a'].care, { sleeve: true, toploader: true });
  assert.equal(protect(s, 'nope', 'sleeve'), false);
});

test('shop sells sleeves and toploaders as inventory items', () => {
  const s = newState(0);
  s.coins = 100;
  assert.equal(buy(s, 'sleeve'), true);
  assert.equal(buy(s, 'toploader'), true);
  assert.equal(countOf(s, 'sleeve'), 1);
  assert.equal(countOf(s, 'toploader'), 1);
  assert.ok(s.coins < 100 && s.coins >= 0);
});

test('sendToGrading: pays the fee, blocks training cards, busy cards and missing coins', () => {
  const s = newState(0);
  addCards(s, [card('a', 'Charizard', 'Rare Holo')]);
  const fee = gradeCost(tierOf('Rare Holo'), 0);
  assert.deepEqual(sendToGrading(s, 'a', 0), { ok: false, reason: 'coins' });
  s.coins = fee + 1;
  assert.deepEqual(sendToGrading(s, 'nope', 0), { ok: false, reason: 'none' });
  assert.deepEqual(sendToGrading(s, 'a', 1_000), { ok: true, cost: fee });
  assert.equal(s.coins, 1);
  assert.deepEqual(s.collection['a'].grading, { since: 1_000, cost: fee });
  assert.deepEqual(sendToGrading(s, 'a', 2_000), { ok: false, reason: 'busy' });

  const t = newState(0);
  addCards(t, [card('b', 'Pikachu')]);
  t.coins = 1000;
  startTraining(t, 'b', 0);
  assert.deepEqual(sendToGrading(t, 'b', 0), { ok: false, reason: 'training' });
  assert.equal(t.coins, 1000);                                    // nothing was charged
});

test('a card out for grading cannot be put to train', () => {
  const s = newState(0);
  addCards(s, [card('a', 'Pikachu')]);
  s.coins = 1000;
  sendToGrading(s, 'a', 0);
  assert.equal(startTraining(s, 'a', 0), false);
});

test('resolveGrading: the card comes back after 500K tokens with a grade, and re-submitting never lowers it', () => {
  const s = newState(0);
  addCards(s, [card('a', 'Charizard')]);
  s.coins = 10_000;
  sendToGrading(s, 'a', 1_000_000);
  assert.deepEqual(resolveGrading(s, 1_000_000 + GRADE_TOKENS - 1), []);            // still away
  assert.equal(gradingProgress(s.collection['a'].grading!, 1_250_000).pct, 50);
  const ev = resolveGrading(s, 1_000_000 + GRADE_TOKENS, () => 0.99);               // dice all high → 10
  assert.deepEqual(ev, ['graded:10:1:Charizard']);
  assert.equal(s.collection['a'].grade, 10);
  assert.equal(s.collection['a'].grading, undefined);
  assert.equal(s.collection['a'].tries, 1);

  assert.equal(sendToGrading(s, 'a', 2_000_000).ok, true);
  assert.equal(s.coins, 10_000 - gradeCost(2, 0) - gradeCost(2, 1));                  // the second submission costs double
  const again = resolveGrading(s, 2_000_000 + GRADE_TOKENS, () => 0);                 // dice all low → 2
  assert.deepEqual(again, ['graded:10:0:Charizard']);                                 // not better: keeps the 10
  assert.equal(s.collection['a'].grade, 10);
  assert.equal(s.collection['a'].tries, 2);
});

test('card names with colons survive in the graded event', () => {
  const s = newState(0);
  addCards(s, [card('a', 'Weird: Name')]);
  s.coins = 1000;
  sendToGrading(s, 'a', 0);
  const [ev] = resolveGrading(s, GRADE_TOKENS, () => 0.5);
  assert.ok(ev.endsWith(':Weird: Name'));
});
