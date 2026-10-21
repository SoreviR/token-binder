import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card, tierOf } from '../src/game/engine';
import {
  BATTLE_VERSION, CRIT_CHANCE, Fighter, MAX_ROUNDS, effectiveness, estimateWin, factorGaps, makeFighter, movesOf, simulate,
} from '../src/game/battle';
import {
  MAX_TOKENS_BONUS, characterOf, combatStats, demandClass, stageClass, strengthOf, tokensBonus,
} from '../src/game/strength';
import { statsOf } from '../src/game/stats';

const card = (name: string, extra: Partial<Card> = {}): Card => ({
  id: name, name, rarity: 'Rare Holo', tier: tierOf('Rare Holo'), era: 'classic', stage: 'Basic', hp: 80,
  types: ['Fire'], weak: ['Water'], resist: [], retreat: 1, image: '',
  attacks: [{ name: 'Ember', damage: 30, cost: 1 }, { name: 'Flamethrower', damage: 60, cost: 3 }], ...extra,
});
const XP = (level: number) => (level - 1) * 400_000;
const fighter = (name: string, extra: Partial<Card> = {}, level = 10) => makeFighter(name, card(name, extra), XP(level), { flat: true });

/* ───── strength model ───── */

test('stageClass groups ex / V / VMAX / Mega cards as special and keeps evolution stages', () => {
  assert.equal(stageClass({ name: 'Pikachu', stage: 'Basic' }), 'basic');
  assert.equal(stageClass({ name: 'Charmeleon', stage: 'Stage1' }), 'stage1');
  assert.equal(stageClass({ name: 'Charizard', stage: 'Stage2' }), 'stage2');
  for (const name of ['Charizard ex', 'Pikachu V', 'Leafeon-GX', 'M Rayquaza EX', 'Mew-EX', 'Gengar GX']) { assert.equal(stageClass({ name, stage: 'Basic' }), 'special', name); }
  assert.equal(stageClass({ name: 'Rayquaza VMAX', stage: 'VMAX' }), 'special');
  assert.equal(stageClass({ name: 'Trevenant BREAK', stage: 'BREAK' }), 'special');
});

test('demand class follows the market value and falls back to the rarity category', () => {
  assert.equal(demandClass({ price: { eur: 0.3 }, tier: 6 }), 0);       // the price wins over the rarity label
  assert.equal(demandClass({ price: { eur: 3 }, tier: 0 }), 1);
  assert.equal(demandClass({ price: { eur: 1161 }, tier: 0 }), 5);
  assert.equal(demandClass({ price: undefined, tier: 0 }), 0);
  assert.equal(demandClass({ price: {}, tier: 4 }), 3);
  assert.equal(demandClass({ price: undefined, tier: 99 }), 5);
});

test('strength factors are small, capped and visible', () => {
  const base = strengthOf({ price: { eur: 0.5 }, tier: 0, name: 'Pidgey', stage: 'Basic' }, 1);
  assert.equal(base.total, 1);
  const lv50 = strengthOf({ price: { eur: 0.5 }, tier: 0, name: 'Pidgey', stage: 'Basic' }, 50);
  assert.ok(lv50.level > 1.85 && lv50.level < 1.9);
  const grail = strengthOf({ price: { eur: 900 }, tier: 6, name: 'Charizard ex', stage: 'Basic' }, 1, { grade: 10, tokensBonus: 1 });
  assert.ok(grail.demand <= 1.1 + 1e-9 && grail.rarity <= 1.018 + 1e-9 && grail.stage <= 1.04 + 1e-9 && grail.grade <= 1.04 + 1e-9, JSON.stringify(grail));
  assert.ok(grail.tokens <= 1 + MAX_TOKENS_BONUS + 1e-9);                // asking for more than the cap does not help
  assert.equal(strengthOf({ price: undefined, tier: 2, name: 'X' }, 10, { grade: 5 }).grade, 1);   // only grades above 5 count
  assert.equal(strengthOf({ price: undefined, tier: 2, name: 'X' }, 40, { levelCap: 15 }).level, 1 + 0.018 * 14);
  const flat = strengthOf({ price: { eur: 900 }, tier: 6, name: 'Charizard ex' }, 1, { flat: true });
  assert.equal(flat.total, 1);
});

test('tokensBonus rewards the player who used less of the quota: 2% per 25 points, at most 8%, never negative', () => {
  assert.equal(tokensBonus(50, 50), 0);
  assert.equal(tokensBonus(80, 20), 0);                  // using more than the rival gives nothing
  assert.equal(tokensBonus(40, 70), 0.02);
  assert.equal(tokensBonus(0, 50), 0.04);
  assert.equal(tokensBonus(0, 100), MAX_TOKENS_BONUS);
  assert.equal(tokensBonus(0, 1000), MAX_TOKENS_BONUS);
});

test('personality only tilts a card between tanky and hard-hitting: total power (HP × ATK) is the same for every card', () => {
  const tank = card('Tank', { hp: 140, attacks: [{ name: 'Slap', damage: 20, cost: 1 }] });
  const cannon = card('Cannon', { hp: 55, attacks: [{ name: 'Boom', damage: 90, cost: 3 }] });
  const t = combatStats(tank, XP(10), { flat: true }).stats, c = combatStats(cannon, XP(10), { flat: true }).stats;
  assert.ok(t.hp > c.hp && t.atk < c.atk, 'the tank has more HP and less ATK');
  assert.ok(Math.abs(t.hp * t.atk - c.hp * c.atk) / (c.hp * c.atk) < 0.03, `${t.hp * t.atk} vs ${c.hp * c.atk}`);
  const ch = characterOf(tank);
  assert.ok(Math.abs(ch.hp * ch.atk - 1) < 1e-9);
});

test('cards with missing data still get sane stats', () => {
  const broken = { id: 'x', name: 'Mystery', rarity: 'Rare', tier: 2, image: '' } as Card;
  const s = combatStats(broken, 0).stats;
  for (const v of Object.values(s)) { assert.ok(Number.isFinite(v) && v > 0); }
  assert.equal(movesOf(broken).length, 1);
  assert.equal(movesOf({ attacks: [] }).length, 1);
});

test('statsOf is the same model as the battles use', () => {
  const c = card('Same');
  assert.deepEqual(statsOf(c, XP(7)), combatStats(c, XP(7)).stats);
});

test('moves are rescaled so the average move of every card has power 1.0', () => {
  for (const attacks of [
    [{ name: 'A', damage: 10, cost: 1 }, { name: 'B', damage: 100, cost: 3 }],
    [{ name: 'A', damage: 50, cost: 2 }],
    [{ name: 'A', damage: 0, cost: 1 }, { name: 'B', damage: 0, cost: 1 }],
    [{ name: 'A', damage: 20, cost: 1 }, { name: 'B', damage: 40, cost: 2 }, { name: 'C', damage: 0, cost: 1 }],
  ]) {
    const moves = movesOf({ attacks });
    const total = moves.reduce((s, m) => s + m.weight, 0);
    const mean = moves.reduce((s, m) => s + m.power * m.weight, 0) / total;
    assert.ok(Math.abs(mean - 1) < 1e-9, JSON.stringify(attacks));
  }
});

/* ───── simulator ───── */

test('a fight is deterministic: the same seed repeats it exactly, another seed changes it', () => {
  const a = fighter('Alpha'), b = fighter('Beta');
  const first = simulate(a, b, 1234), again = simulate(a, b, 1234);
  assert.deepEqual(first, again);
  assert.equal(first.version, BATTLE_VERSION);
  const other = Array.from({ length: 20 }, (_, i) => JSON.stringify(simulate(a, b, 1235 + i).log));
  assert.ok(other.some(l => l !== JSON.stringify(first.log)));
});

test('the log is coherent: starts, ends with the winner, HP only goes down and the loser reaches 0 on a KO', () => {
  const a = fighter('Alpha'), b = fighter('Beta');
  for (let seed = 0; seed < 200; seed++) {
    const r = simulate(a, b, seed);
    assert.equal(r.log[0].t, 'start');
    const end = r.log[r.log.length - 1];
    assert.equal(end.t, 'end');
    let prev = { a: a.hp, b: b.hp };
    for (const ev of r.log) {
      if (ev.t !== 'attack') { continue; }
      assert.ok(ev.hp.a <= prev.a && ev.hp.b <= prev.b);
      assert.ok(ev.dmg >= 0 && (ev.miss ? ev.dmg === 0 : ev.dmg >= 1));
      prev = ev.hp;
    }
    if (r.reason === 'ko') { assert.equal(r.hpLeft[r.winner === 'a' ? 'b' : 'a'], 0); assert.ok(r.hpLeft[r.winner] > 0); }
    assert.ok(r.rounds >= 1 && r.rounds <= MAX_ROUNDS);
  }
});

test('the fight cannot go on forever: it stops at the round limit and the healthier fighter wins', () => {
  const wall = (name: string, hp: number): Fighter => ({ ...fighter(name), hp, atk: 0.01, def: 5000 });
  const r = simulate(wall('A', 100), wall('B', 100000), 5);
  assert.equal(r.reason, 'timeout');
  assert.equal(r.rounds, MAX_ROUNDS);
  assert.ok(['a', 'b'].includes(r.winner));
});

test('weakness hurts more and resistance less, only for the attacker\'s main type', () => {
  const fire = fighter('Fire', { types: ['Fire'], weak: ['Water'], resist: [] });
  const water = fighter('Water', { types: ['Water'], weak: ['Lightning'], resist: ['Fire'] });
  assert.equal(effectiveness(water, fire).eff, 'weak');
  assert.equal(effectiveness(fire, water).eff, 'resist');
  assert.equal(effectiveness(fire, fire).eff, undefined);
  assert.ok(effectiveness(water, fire).mult > 1 && effectiveness(fire, water).mult < 1);
  const typeless = { ...fire, types: [] as string[] };
  assert.equal(effectiveness(typeless, water).mult, 1);
});

test('the log names the real attacks of the card and marks critical hits, misses and type effects', () => {
  const a = fighter('Fire', { types: ['Fire'] }), b = fighter('Water', { types: ['Water'], weak: ['Fire'] });
  const seen = { crit: false, miss: false, weak: false, names: new Set<string>() };
  for (let seed = 0; seed < 300; seed++) {
    for (const ev of simulate(a, b, seed).log) {
      if (ev.t !== 'attack') { continue; }
      seen.crit ||= ev.crit; seen.miss ||= ev.miss; seen.weak ||= ev.eff === 'weak'; seen.names.add(ev.move);
    }
  }
  assert.ok(seen.crit && seen.miss && seen.weak);
  assert.ok(seen.names.has('Ember') && seen.names.has('Flamethrower'));
  assert.ok(CRIT_CHANCE > 0);
});

test('estimateWin is stable and agrees with a clear strength advantage', () => {
  const a = fighter('Alpha', {}, 40), b = fighter('Beta', {}, 1);
  assert.ok(estimateWin(a, b) > 0.88);
  assert.ok(estimateWin(b, a) < 0.12);
  const mirror = estimateWin(fighter('Same'), fighter('Same'), 2000);
  assert.ok(mirror > 0.44 && mirror < 0.56);
});

test('factorGaps names the factors in which two fighters differ most, biggest first', () => {
  const rich = makeFighter('r', card('Rich', { price: { eur: 800 }, tier: 6 }), XP(5));
  const poor = makeFighter('p', card('Poor', { price: { eur: 0.5 }, tier: 0 }), XP(5));
  const gaps = factorGaps(rich, poor);
  assert.equal(gaps[0].factor, 'demand');
  assert.ok(gaps.every(g => g.ratio !== 1));
  assert.deepEqual(factorGaps(poor, poor), []);
});
