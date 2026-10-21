// The balance contract. These ranges are the design target for the 1v1 battles; `npm run balance` prints the full report
// used to tune strength.ts / battle.ts. Any change to the rules has to keep these true.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Card } from '../src/game/engine';
import { Fighter, MAX_ROUNDS, makeFighter, simulate } from '../src/game/battle';
import { LEVEL_STEP, stageClass } from '../src/game/strength';

const corpus: Card[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'battle-corpus.json'), 'utf8'));
const XP = (level: number) => (level - 1) * 400_000;
const flatFighter = (c: Card, level = 10) => makeFighter(c.id, c, XP(level), { flat: true });
const scaled = (f: Fighter, r: number): Fighter => ({ ...f, hp: Math.round(f.hp * Math.sqrt(r)), atk: f.atk * Math.sqrt(r) });

/** Win rate of `a` against `b`. The seed mixes both fighters so no two pairs share a random sequence. */
function winRate(a: Fighter, b: Fighter, runs: number, salt: number): number {
  let w = 0;
  for (let i = 0; i < runs; i++) { if (simulate(a, b, salt * 1_000_003 + i * 104729 + 17).winner === 'a') { w++; } }
  return w / runs;
}

test('the corpus has real variety: every era, every stage class, and cards with missing data', () => {
  assert.ok(corpus.length >= 300);
  assert.equal(new Set(corpus.map(c => c.era)).size, 5);
  assert.equal(new Set(corpus.map(stageClass)).size, 4);
  assert.ok(corpus.some(c => !(c.attacks ?? []).some(a => a.damage > 0)), 'cards whose attacks do no damage');
  assert.ok(corpus.some(c => !c.price || (c.price.eur === undefined && c.price.usd === undefined)), 'cards with no price');
});

test('mirror match: the same card against itself is a coin flip', () => {
  const f = flatFighter(corpus[0]);
  const r = winRate(f, f, 6000, 1);
  assert.ok(r > 0.47 && r < 0.53, `mirror ${r}`);
});

test('strength → win rate curve: gentle at small gaps, decisive at large ones, always increasing', () => {
  const f = flatFighter(corpus[10]);
  const at = (ratio: number) => winRate(scaled(f, ratio), f, 5000, 2);
  const [r105, r110, r125, r150, r200] = [1.05, 1.1, 1.25, 1.5, 2].map(at);
  assert.ok(r110 > 0.58 && r110 < 0.68, `1.10 → ${r110}`);
  assert.ok(r125 > 0.74 && r125 < 0.86, `1.25 → ${r125}`);
  assert.ok(r150 >= 0.88, `1.50 → ${r150}`);
  assert.ok(r105 < r110 && r110 < r125 && r125 < r150 && r150 <= r200 + 0.005);
  assert.ok(r105 > 0.52, `even a 5% gap should show: ${r105}`);
});

test('no card is a better fighter just because of what is printed on it: every card stays near 50% against the field', () => {
  const flat = corpus.map(c => flatFighter(c));
  const rates = flat.map((f, i) => {
    let sum = 0, n = 0;
    for (let k = 1; k <= 30; k++) { const j = (i + k * 7) % flat.length; if (j === i) { continue; } sum += winRate(f, flat[j], 16, i * 4099 + j + 3); n++; }
    return sum / n;
  });
  const sorted = [...rates].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.floor(sorted.length * p)];
  assert.ok(sorted[0] > 0.37 && sorted[sorted.length - 1] < 0.63, `range ${sorted[0]} … ${sorted[sorted.length - 1]}`);
  assert.ok(at(0.1) > 0.43 && at(0.9) < 0.57, `p10 ${at(0.1)}, p90 ${at(0.9)}`);

  // and no era / stage class is systematically better
  const groups = new Map<string, number[]>();
  corpus.forEach((c, i) => { const k = `${c.era}/${stageClass(c)}`; groups.set(k, [...(groups.get(k) ?? []), rates[i]]); });
  for (const [k, v] of groups) {
    if (v.length < 10) { continue; }
    const mean = v.reduce((s, x) => s + x, 0) / v.length;
    assert.ok(mean > 0.44 && mean < 0.56, `${k}: ${mean}`);
  }
});

test('pairs without any type interaction are close fights', () => {
  const flat = corpus.map(c => ({ c, f: flatFighter(c) }));
  const hits = (x: Card, y: Card) => !!x.types?.[0] && ((y.weak ?? []).includes(x.types[0]) || (y.resist ?? []).includes(x.types[0]));
  let checked = 0, worst = 0;
  for (let i = 0; i < flat.length && checked < 120; i += 3) {
    for (let j = i + 1; j < flat.length && checked < 120; j += 11) {
      if (hits(flat[i].c, flat[j].c) || hits(flat[j].c, flat[i].c)) { continue; }
      const r = winRate(flat[i].f, flat[j].f, 300, i * 7919 + j);
      worst = Math.max(worst, Math.abs(r - 0.5));
      checked++;
    }
  }
  assert.ok(checked >= 100);
  assert.ok(worst < 0.14, `most lopsided neutral pair is ${(50 + worst * 100).toFixed(1)}%`);
});

test('a weakness helps clearly but does not decide the fight', () => {
  let total = 0, n = 0;
  for (const defender of corpus.filter(c => (c.weak ?? []).length).slice(0, 60)) {
    const attacker = corpus.find(c => c.types?.[0] === defender.weak![0] && c.id !== defender.id && !(c.weak ?? []).includes(defender.types?.[0] ?? ''));
    if (!attacker) { continue; }
    total += winRate(flatFighter(attacker), flatFighter(defender), 400, n + 5);
    n++;
  }
  assert.ok(n >= 30);
  const mean = total / n;
  assert.ok(mean > 0.62 && mean < 0.72, `weakness win rate ${mean}`);
});

test('training level is what makes a fighter stronger', () => {
  const c = corpus[3];
  const rate = (d: number) => winRate(makeFighter('a', c, XP(1 + d), { flat: true }), makeFighter('b', c, XP(1), { flat: true }), 5000, 10 + d);
  const r1 = rate(1), r5 = rate(5), r10 = rate(10), r20 = rate(20);
  assert.ok(r5 > 0.56 && r5 < 0.66, `+5 levels → ${r5}`);
  assert.ok(r20 > 0.8 && r20 < 0.93, `+20 levels → ${r20}`);
  assert.ok(r1 < r5 && r5 < r10 && r10 < r20);
  assert.ok(1 + LEVEL_STEP * 20 > 1.25);
});

test('market demand and the other bonuses count, but at the same level they stay small', () => {
  const base = corpus.find(c => c.price?.eur !== undefined && c.price.eur < 1) ?? corpus[0];
  const cheap = { ...base, price: { eur: 0.5 }, tier: 2 }, pricey = { ...base, price: { eur: 150 }, tier: 4 };
  const a = makeFighter('a', pricey, XP(10)), b = makeFighter('b', cheap, XP(10));
  const r = winRate(a, b, 6000, 21);
  assert.ok(r > 0.55 && r < 0.7, `market class 'sought' vs 'common' at equal level → ${r}`);
  const tokens = winRate(makeFighter('a', cheap, XP(10), { tokensBonus: 0.08 }), b, 6000, 22);
  assert.ok(tokens > 0.55 && tokens < 0.75, `max token bonus → ${tokens}`);
});

test('battle length: a few rounds, never close to the limit', () => {
  const flat = corpus.map(c => flatFighter(c));
  let rounds = 0, runs = 0, timeouts = 0, longest = 0;
  for (let i = 0; i < flat.length; i += 2) {
    const j = (i * 5 + 3) % flat.length;
    for (let s = 0; s < 6; s++) {
      const r = simulate(flat[i], flat[j], s * 31 + i);
      rounds += r.rounds; runs++; longest = Math.max(longest, r.rounds);
      if (r.reason === 'timeout') { timeouts++; }
    }
  }
  const mean = rounds / runs;
  assert.ok(mean >= 6.5 && mean <= 10, `mean rounds ${mean}`);
  assert.equal(timeouts, 0);
  assert.ok(longest < MAX_ROUNDS);
});

test('robustness: every corpus card, at any level, gives finite stats and a finished fight', () => {
  for (const [i, c] of corpus.entries()) {
    for (const level of [1, 25, 50]) {
      const f = makeFighter(c.id, c, XP(level));
      for (const v of [f.hp, f.atk, f.def, f.spd, f.strength.total]) { assert.ok(Number.isFinite(v) && v > 0, `${c.name} level ${level}`); }
    }
    const r = simulate(makeFighter('a', c, XP(1)), makeFighter('b', corpus[(i + 1) % corpus.length], XP(50)), i);
    assert.ok(r.rounds >= 1 && r.rounds <= MAX_ROUNDS && (r.winner === 'a' || r.winner === 'b'));
  }
});
