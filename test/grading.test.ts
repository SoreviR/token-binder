import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card, addCards, buy, countOf, grantItem, newState, startTraining, tierOf } from '../src/game/engine';
import {
  GRADE_TOKENS, MAX_WEAR, applyWear, cancelGrading, cancelRefund, conditionMultiplier, gradeCost, gradeMultiplier, gradingProgress, protect, resolveGrading, rollGrade, sendToGrading, wearChance,
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

test('cancelGrading: gives half the fee back, keeps the grade and tries, and frees the card', () => {
  const s = newState(0);
  addCards(s, [card('a', 'Charizard', 'Rare Holo')]);
  s.coins = 1000;
  assert.equal(cancelGrading(s, 'a'), undefined);                // not at the service
  assert.equal(cancelGrading(s, 'nope'), undefined);
  assert.equal(s.coins, 1000);

  sendToGrading(s, 'a', 0);
  const fee = gradeCost(tierOf('Rare Holo'), 0);
  const left = s.coins;
  assert.equal(cancelGrading(s, 'a'), cancelRefund(fee));
  assert.equal(s.coins, left + Math.floor(fee / 2));
  assert.equal(s.collection['a'].grading, undefined);
  assert.equal(s.collection['a'].tries, undefined);
  assert.deepEqual(resolveGrading(s, GRADE_TOKENS), []);         // nothing comes back
  assert.equal(sendToGrading(s, 'a', 0).ok, true);               // it can be sent again at the same price
  assert.equal(startTraining(s, 'a', 0), false);
});

test('card names with colons survive in the graded event', () => {
  const s = newState(0);
  addCards(s, [card('a', 'Weird: Name')]);
  s.coins = 1000;
  sendToGrading(s, 'a', 0);
  const [ev] = resolveGrading(s, GRADE_TOKENS, () => 0.5);
  assert.ok(ev.endsWith(':Weird: Name'));
});

/* ───── wear ───── */

test('wear chance per fight: none 10%, sleeve 2%, toploader 4%, both 0%, and a graded card (slab) never wears', () => {
  assert.equal(wearChance({}), 0.1);
  assert.equal(wearChance({ care: { sleeve: true } }), 0.02);
  assert.equal(wearChance({ care: { toploader: true } }), 0.04);
  assert.equal(wearChance({ care: { sleeve: true, toploader: true } }), 0);
  assert.equal(wearChance({ grade: 8 }), 0);
  assert.equal(wearChance({ wear: MAX_WEAR }), 0);               // nothing left to lose
});

test('applyWear moves the card one step down only when the roll says so, never past the last step', () => {
  const s = newState(0);
  addCards(s, [card('a', 'Charizard')]);
  assert.equal(applyWear(s, 'a', () => 0.5), undefined);          // above 10%: safe
  assert.equal(s.collection['a'].wear, undefined);
  assert.equal(applyWear(s, 'a', () => 0.05), 1);
  assert.equal(applyWear(s, 'a', () => 0.0), 2);
  for (let i = 0; i < 10; i++) { applyWear(s, 'a', () => 0); }
  assert.equal(s.collection['a'].wear, MAX_WEAR);
  assert.equal(applyWear(s, 'nope', () => 0), undefined);
  protect(s, 'a', 'sleeve');                                      // no item: nothing changes
  grantItem(s, 'sleeve'); grantItem(s, 'toploader');
  const t = newState(0);
  addCards(t, [card('b', 'Pikachu')]);
  grantItem(t, 'sleeve'); grantItem(t, 'toploader');
  protect(t, 'b', 'sleeve'); protect(t, 'b', 'toploader');
  for (let i = 0; i < 50; i++) { assert.equal(applyWear(t, 'b', () => 0), undefined); }   // fully protected
  assert.equal(t.collection['b'].wear, undefined);
});

test('wear measured over many fights matches the stated chances', () => {
  const trial = (care: { sleeve?: boolean; toploader?: boolean }) => {
    const rng = mulberry32(2024);
    let worn = 0;
    for (let i = 0; i < 20_000; i++) {
      const s = newState(0);
      addCards(s, [card('a', 'X')]);
      s.collection['a'].care = care;
      if (applyWear(s, 'a', rng)) { worn++; }
    }
    return worn / 20_000;
  };
  assert.ok(Math.abs(trial({}) - 0.1) < 0.01);
  assert.ok(Math.abs(trial({ sleeve: true }) - 0.02) < 0.006);
  assert.equal(trial({ sleeve: true, toploader: true }), 0);
});

test('wear costs 0.05 of grading quality per step and 6% of the market value, and a slab ignores the condition', () => {
  const none = (wear: number) => { const rng = mulberry32(5); let sum = 0; for (let i = 0; i < 20_000; i++) { sum += rollGrade(undefined, rng, wear); } return sum / 20_000; };
  assert.ok(none(0) > none(2) && none(2) > none(4));
  assert.ok(Math.abs((none(0) - none(4)) - 8 * 0.05 * 4) < 0.15, `expected a drop near 1.6 grade points, got ${none(0) - none(4)}`);
  assert.equal(conditionMultiplier(undefined), 1);
  assert.equal(conditionMultiplier(0), 1);
  assert.ok(Math.abs(conditionMultiplier(2) - 0.88) < 1e-9);
  assert.ok(Math.abs(conditionMultiplier(4) - 0.76) < 1e-9);
  assert.equal(conditionMultiplier(4, 9), 1);
  assert.equal(conditionMultiplier(99), conditionMultiplier(4));
});

test('a worn card comes back from grading with a worse grade on average than a mint one', () => {
  const avg = (wear: number) => {
    const rng = mulberry32(77);
    let sum = 0;
    for (let i = 0; i < 4000; i++) {
      const s = newState(0);
      addCards(s, [card('a', 'X')]);
      s.collection['a'].wear = wear;
      s.collection['a'].grading = { since: 0, cost: 1 };
      resolveGrading(s, GRADE_TOKENS, rng);
      sum += s.collection['a'].grade!;
    }
    return sum / 4000;
  };
  assert.ok(avg(0) - avg(4) > 1.2, `${avg(0)} vs ${avg(4)}`);
});
