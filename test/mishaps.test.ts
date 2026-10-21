import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card, addCards, buy, countOf, grantItem, newState, sellDuplicates, startTraining, tierOf } from '../src/game/engine';
import { MAX_WEAR, conditionMultiplier, sendToGrading, wearChance } from '../src/game/grading';
import { ITEM_LIST, rollBox } from '../src/game/items';
import { battleOf, playerFighter, setFighter } from '../src/game/leaders';
import {
  MISHAPS, ROCKET, dryCard, overageMishap, rainSoak, recordRocketBattle, recoverStolen, rocketSteal, rollMishap, tripAndDrop,
} from '../src/game/mishaps';

const card = (id: string, name = id, rarity = 'Rare'): Card => ({ id, name, rarity, tier: tierOf(rarity), image: `https://x/${id}` });

/** Small seeded generator so the random tests are repeatable. */
function mulberry32(seed: number): () => number {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A state with `n` different cards, one copy each. */
function album(n: number) {
  const s = newState(0);
  addCards(s, Array.from({ length: n }, (_, i) => card('c' + i)));
  return s;
}
const copiesOf = (s: ReturnType<typeof newState>) => Object.values(s.collection).reduce((n, o) => n + o.count, 0);

test('rollMishap: Team Rocket 60%, trip 30%, rain 10%', () => {
  assert.deepEqual(MISHAPS.map(([k]) => k), ['rocket', 'trip', 'rain']);
  assert.equal(rollMishap(() => 0), 'rocket');
  assert.equal(rollMishap(() => 0.59), 'rocket');
  assert.equal(rollMishap(() => 0.61), 'trip');
  assert.equal(rollMishap(() => 0.89), 'trip');
  assert.equal(rollMishap(() => 0.91), 'rain');
  assert.equal(rollMishap(() => 0.999999), 'rain');
  const n = { rocket: 0, trip: 0, rain: 0 };
  const rng = mulberry32(7);
  for (let i = 0; i < 20_000; i++) { n[rollMishap(rng)]++; }
  assert.ok(Math.abs(n.rocket / 20_000 - 0.6) < 0.02 && Math.abs(n.trip / 20_000 - 0.3) < 0.02 && Math.abs(n.rain / 20_000 - 0.1) < 0.01, JSON.stringify(n));
});

test('overageMishap: only past 100% and only once per quota period', () => {
  const s = album(20);
  assert.equal(overageMishap(s, 100, 1000, () => 0), null, 'exactly 100% is not going over');
  assert.equal(s.mishapPeriod, undefined);
  const m = overageMishap(s, 101, 1000, () => 0);
  assert.equal(m?.kind, 'rocket');
  assert.equal(s.mishapPeriod, 1000);
  assert.equal(overageMishap(s, 150, 1000, () => 0), null, 'one per period');
  assert.equal(overageMishap(s, 101, 2000, () => 0)?.kind, 'rocket', 'a new period can bring another one');
  assert.equal(overageMishap(newState(0), 120, 1000, () => 0), null, 'nothing to lose in an empty album');
});

test('Team Rocket steals one copy, keeps it to be won back, and never takes the training or grading copy', () => {
  const s = album(0);
  addCards(s, [card('a'), card('a'), card('b')]);
  s.collection.a.xp = 1234;
  const m = rocketSteal(s, () => 0)!;   // the first copy in the pool: one of the two 'a'
  assert.deepEqual(m.cards, [{ key: 'a', name: 'a', n: 1 }]);
  assert.equal(s.collection.a.count, 1);
  assert.equal(s.stolen?.length, 1);
  assert.equal(s.stolen![0].count, 1);
  assert.equal(s.stolen![0].xp, 1234);

  // the only copies left are training (a) and at the grading service (b): nothing can be stolen
  assert.ok(startTraining(s, 'a', 0));
  s.collection.b.grading = { since: 0, cost: 50 };
  assert.equal(rocketSteal(s, () => 0), null);
});

test('losing the last copy removes the card and it stops being the battle card', () => {
  const s = album(1);
  assert.ok(setFighter(s, 'c0'));
  rocketSteal(s, () => 0);
  assert.equal(s.collection.c0, undefined);
  assert.equal(s.fighter, undefined);
});

test('a win against Team Rocket brings the card back as it was; a loss does not, and neither pays coins nor badges', () => {
  const s = album(1);
  s.collection.c0.xp = 5000;
  s.collection.c0.grade = 8;
  rocketSteal(s, () => 0);
  s.coins = 10;
  assert.equal(recordRocketBattle(s, 'Pikachu', false, 5), null);
  assert.equal(s.stolen?.length, 1);
  const back = recordRocketBattle(s, 'Pikachu', true, 6);
  assert.equal(back?.id, 'c0');
  assert.equal(s.collection.c0.count, 1);
  assert.equal(s.collection.c0.xp, 5000);
  assert.equal(s.collection.c0.grade, 8);
  assert.equal(s.stolen, undefined);
  assert.equal(s.coins, 10);
  const b = battleOf(s);
  assert.deepEqual([b.wins, b.losses, b.streak], [1, 1, 1]);
  assert.deepEqual(b.badges, []);
  assert.equal(b.history[0].leader, ROCKET.id);
  assert.equal(recoverStolen(s), null);
});

test('a card stolen while you still had copies comes back as one more copy', () => {
  const s = album(0);
  addCards(s, [card('a'), card('a')]);
  rocketSteal(s, () => 0);
  recoverStolen(s);
  assert.equal(s.collection.a.count, 2);
});

test('tripping drops 10% of the copies (at least one), and graded cards are safe in their slab', () => {
  const s = album(40);
  const m = tripAndDrop(s, mulberry32(3))!;
  assert.equal(m.kind, 'trip');
  assert.equal(m.cards.reduce((n, c) => n + c.n, 0), 4);
  assert.equal(copiesOf(s), 36);

  const one = album(1);
  assert.equal(tripAndDrop(one, () => 0)?.cards[0].n, 1, 'at least one card falls');
  assert.equal(copiesOf(one), 0);

  const graded = album(5);
  for (const o of Object.values(graded.collection)) { o.grade = 7; }
  assert.equal(tripAndDrop(graded, () => 0), null);
  assert.equal(copiesOf(graded), 5);
});

test('tripping also scuffs another 10% of the cards: one step of wear, or a sleeve takes the hit and is torn', () => {
  const s = album(40);
  const m = tripAndDrop(s, mulberry32(3))!;
  assert.equal((m.worn ?? 0) + (m.sleevesLost ?? 0), 4, '10% of the 36 cards left, rounded');
  assert.equal(Object.values(s.collection).filter(o => o.wear === 1).length, m.worn);

  const sleeved = album(20);
  for (const o of Object.values(sleeved.collection)) { o.care = { sleeve: true, toploader: true }; }
  const r = tripAndDrop(sleeved, mulberry32(9))!;
  assert.equal(r.worn, 0, 'a sleeve stops the wear');
  assert.equal(r.sleevesLost, 2);
  const torn = Object.values(sleeved.collection).filter(o => !o.care?.sleeve);
  assert.equal(torn.length, 2);
  for (const o of torn) { assert.equal(o.wear, undefined); assert.equal(o.care?.toploader, true, 'only the sleeve is lost'); }

  // nothing left to hurt: worn out without a sleeve, soaked or graded cards are skipped
  const done = album(10);
  for (const o of Object.values(done.collection)) { o.wear = MAX_WEAR; }
  const d = tripAndDrop(done, () => 0)!;
  assert.deepEqual([d.worn, d.sleevesLost], [0, 0]);
});

test('the rain reaches half of the album; sleeves and slabs keep cards dry, cards in training are not there', () => {
  const s = album(10);
  for (const k of ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']) { s.collection[k].care = { sleeve: true }; }
  s.collection.c8.grade = 9;
  const m = rainSoak(s, mulberry32(11))!;
  assert.equal(m.cards.length + m.saved, 5);
  for (const { key } of m.cards) { assert.equal(key, 'c9'); }
  assert.ok(!s.collection.c8.soaked, 'a slab keeps the card dry');
  for (let i = 0; i < 8; i++) { assert.ok(!s.collection['c' + i].soaked, 'a sleeve keeps the card dry'); }

  const bare = album(10);
  assert.equal(rainSoak(bare, mulberry32(5))!.cards.length, 5);
  assert.equal(Object.values(bare.collection).filter(o => o.soaked).length, 5);

  const training = album(1);
  assert.ok(startTraining(training, 'c0', 0));
  assert.equal(rainSoak(training, () => 0), null);
});

test('a soaked card is worthless and cannot be sold, trained, graded or taken to battle', () => {
  const s = album(0);
  addCards(s, [card('a'), card('a'), card('b')]);
  s.collection.a.soaked = true;
  s.coins = 1000;
  assert.equal(conditionMultiplier(0, undefined, true), 0);
  assert.equal(wearChance(s.collection.a), 0);
  assert.equal(sellDuplicates(s), 0);
  assert.equal(s.collection.a.count, 2);
  assert.equal(startTraining(s, 'a', 0), false);
  assert.deepEqual(sendToGrading(s, 'a', 0), { ok: false, reason: 'soaked' });
  assert.ok(setFighter(s, 'a'));
  assert.deepEqual(playerFighter(s, 50), { ok: false, reason: 'soaked' });
});

test('the Charmandryer: bought in the shop (never in a box), dries one soaked card that stays Heavily Played', () => {
  const s = album(2);
  s.collection.c0.soaked = true;
  assert.equal(dryCard(s, 'c0'), false, 'needs a dryer');
  s.coins = 39;
  assert.equal(buy(s, 'hair-dryer'), false);
  s.coins = 40;
  assert.equal(buy(s, 'hair-dryer'), true);
  assert.equal(countOf(s, 'hair-dryer'), 1);
  assert.equal(dryCard(s, 'c1'), false, 'a dry card does not spend it');
  assert.equal(dryCard(s, 'c0'), true);
  assert.equal(s.collection.c0.soaked, undefined);
  assert.equal(s.collection.c0.wear, MAX_WEAR);
  assert.equal(countOf(s, 'hair-dryer'), 0);

  assert.ok(ITEM_LIST.some(i => i.id === 'hair-dryer'));
  for (let i = 0; i < 1000; i++) { assert.notEqual(rollBox(5, () => i / 1000), 'hair-dryer'); }
  assert.notEqual(rollBox(0, () => 0.9999999), 'hair-dryer');
  grantItem(s, 'hair-dryer', 2);
  assert.equal(countOf(s, 'hair-dryer'), 2);
});
