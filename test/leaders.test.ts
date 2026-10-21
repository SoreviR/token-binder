import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Card, addCards, keyOf, newState, normalize, tierOf } from '../src/game/engine';
import { estimateWin, makeFighter } from '../src/game/battle';
import {
  HISTORY_SIZE, LADDER_REFERENCE_PCT, LEADERS, LEADER_BY_ID, REMATCH_DAILY_CAP, battleOf, dayKey, leaderFighter, leaderUnlocked, playerFighter, recordBattle,
  setFighter, xpForLevel,
} from '../src/game/leaders';

const card = (id: string, name = id, extra: Partial<Card> = {}): Card => ({
  id, name, rarity: 'Rare Holo', tier: tierOf('Rare Holo'), era: 'classic', stage: 'Basic', hp: 80, types: ['Fire'], weak: ['Water'], retreat: 1, image: '',
  attacks: [{ name: 'Ember', damage: 40, cost: 1 }], ...extra,
});
const corpus: Card[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'battle-corpus.json'), 'utf8'));
const NOON = (day: number) => new Date(2026, 9, day, 12, 0, 0).getTime();

test('the ladder: eight leaders, in order of difficulty, with growing rewards and unique ids', () => {
  assert.equal(LEADERS.length, 8);
  assert.equal(new Set(LEADERS.map(l => l.id)).size, 8);
  for (let i = 1; i < LEADERS.length; i++) {
    assert.ok(LEADERS[i].level > LEADERS[i - 1].level && LEADERS[i].reward > LEADERS[i - 1].reward && LEADERS[i].demand >= LEADERS[i - 1].demand);
  }
  assert.ok(LEADERS.every(l => l.species && l.name && l.rematch > 0 && l.rematch < l.reward));
  assert.equal(LEADER_BY_ID['brock'].species, 'Onix');
});

test('dayKey is the local calendar day', () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59).getTime()), '2026-01-05');
  assert.equal(dayKey(new Date(2026, 10, 30, 0, 1).getTime()), '2026-11-30');
});

test('a leader unlocks when the previous one has been beaten', () => {
  const s = newState(0);
  assert.equal(leaderUnlocked(s, 0), true);
  assert.equal(leaderUnlocked(s, 1), false);
  battleOf(s).badges.push('brock');
  assert.equal(leaderUnlocked(s, 1), true);
  assert.equal(leaderUnlocked(s, 2), false);
});

test('setFighter only accepts cards you own', () => {
  const s = newState(0);
  addCards(s, [card('a')]);
  assert.equal(setFighter(s, 'zzz'), false);
  assert.equal(s.fighter, undefined);
  assert.equal(setFighter(s, 'a'), true);
  assert.equal(s.fighter, 'a');
});

test('playerFighter: needs a chosen card, refuses one that is out for grading, and uses level, grade and the token bonus', () => {
  const s = newState(0);
  assert.deepEqual(playerFighter(s, 10), { ok: false, reason: 'none' });
  addCards(s, [card('a')]);
  s.fighter = 'gone';
  assert.deepEqual(playerFighter(s, 10), { ok: false, reason: 'none' });
  s.fighter = 'a';
  s.collection['a'].xp = xpForLevel(12);
  const low = playerFighter(s, 0), high = playerFighter(s, 90);
  assert.ok(low.ok && high.ok);
  if (low.ok && high.ok) {
    assert.equal(low.fighter.level, 12);
    assert.ok(Math.abs(low.fighter.strength.tokens - 1.06) < 1e-9, `quota 0% vs the ${LADDER_REFERENCE_PCT}% reference`);
    assert.equal(high.fighter.strength.tokens, 1);
  }
  s.collection['a'].grade = 10;
  const graded = playerFighter(s, 90);
  assert.ok(graded.ok && graded.fighter.strength.grade > 1);
  s.collection['a'].grading = { since: 0, cost: 30 };
  assert.deepEqual(playerFighter(s, 90), { ok: false, reason: 'grading' });
});

test('leaderFighter uses the level and the fixed demand class of the leader, not the market price of the card', () => {
  const brock = LEADER_BY_ID['brock'];
  const cheap = leaderFighter(brock, card('x', 'Onix', { price: { eur: 0.1 } }));
  const dear = leaderFighter(brock, card('x', 'Onix', { price: { eur: 900 } }));
  assert.equal(cheap.level, brock.level);
  assert.equal(cheap.strength.demand, dear.strength.demand);
  assert.equal(cheap.key, 'leader:brock');
});

test('first victory over a leader gives the badge and the big reward, later ones the small reward', () => {
  const s = newState(0);
  const def = LEADER_BY_ID['brock'];
  const first = recordBattle(s, def, 'Pikachu', true, 8, NOON(1));
  assert.deepEqual(first, { coins: def.reward, firstWin: true, capped: false });
  assert.deepEqual(battleOf(s).badges, ['brock']);
  assert.equal(s.coins, def.reward);
  const again = recordBattle(s, def, 'Pikachu', true, 7, NOON(1));
  assert.deepEqual(again, { coins: def.rematch, firstWin: false, capped: false });
  assert.deepEqual(battleOf(s).badges, ['brock']);                     // no second badge
  assert.equal(s.coins, def.reward + def.rematch);
});

test('rematch rewards stop after the daily limit and come back the next day', () => {
  const s = newState(0);
  const def = LEADER_BY_ID['brock'];
  recordBattle(s, def, 'A', true, 5, NOON(1));                         // badge
  const paid = [];
  for (let i = 0; i < REMATCH_DAILY_CAP + 2; i++) { paid.push(recordBattle(s, def, 'A', true, 5, NOON(1))); }
  assert.equal(paid.filter(p => p.coins > 0).length, REMATCH_DAILY_CAP);
  assert.ok(paid.slice(REMATCH_DAILY_CAP).every(p => p.coins === 0 && p.capped));
  const nextDay = recordBattle(s, def, 'A', true, 5, NOON(2));
  assert.equal(nextDay.coins, def.rematch);
  assert.equal(battleOf(s).daily.rewarded, 1);
});

test('record: wins, losses, streak and best streak; a loss pays nothing and breaks the streak', () => {
  const s = newState(0);
  const def = LEADER_BY_ID['brock'];
  recordBattle(s, def, 'A', true, 5, NOON(1));
  recordBattle(s, def, 'A', true, 5, NOON(1));
  const coins = s.coins;
  const lost = recordBattle(s, def, 'A', false, 9, NOON(1));
  assert.deepEqual(lost, { coins: 0, firstWin: false, capped: false });
  assert.equal(s.coins, coins);
  const b = battleOf(s);
  assert.deepEqual([b.wins, b.losses, b.streak, b.best], [2, 1, 0, 2]);
  recordBattle(s, def, 'A', true, 5, NOON(1));
  assert.deepEqual([b.streak, b.best], [1, 2]);
});

test('history keeps the latest 20 fights, newest first', () => {
  const s = newState(0);
  const def = LEADER_BY_ID['misty'];
  for (let i = 0; i < HISTORY_SIZE + 5; i++) { recordBattle(s, def, `Card ${i}`, i % 2 === 0, 3 + i, NOON(1)); }
  const h = battleOf(s).history;
  assert.equal(h.length, HISTORY_SIZE);
  assert.equal(h[0].card, `Card ${HISTORY_SIZE + 4}`);
  assert.equal(h[HISTORY_SIZE - 1].card, 'Card 5');
  assert.ok(h.every(e => e.leader === 'misty' && e.rounds >= 3));
});

test('an older saved state gets an empty battle record', () => {
  const old: any = { v: 2, baseline: 0, packsGranted: 0, packs: 0, collection: {}, slots: [null], mastered: 0, bonusPeriod: 0 };
  const s = normalize(old, 0);
  assert.deepEqual(s.battle, { wins: 0, losses: 0, streak: 0, best: 0, badges: [], daily: { day: '', rewarded: 0 }, history: [] });
  assert.equal(s.fighter, undefined);
  assert.equal(keyOf(card('z')), 'z');
});

test('ladder difficulty: a player of the leader level has a fair fight, ten levels above has the edge, ten below is at a clear disadvantage', () => {
  const aces = corpus.filter(c => c.hp && (c.attacks ?? []).some(a => a.damage > 0));
  const players = corpus.filter((_, i) => i % 8 === 0);
  const mean = (def: typeof LEADERS[number], level: number, k: number) => {
    const foe = leaderFighter(def, aces[(k * 13) % aces.length]);
    let sum = 0;
    players.forEach((p, i) => { sum += estimateWin(makeFighter('p', p, xpForLevel(level)), foe, 40, i + 100 * k); });
    return sum / players.length;
  };
  LEADERS.forEach((def, k) => {
    const even = mean(def, def.level, k);
    assert.ok(even > 0.4 && even < 0.65, `${def.name} at equal level → ${even}`);
    if (def.level + 10 <= 50) { assert.ok(mean(def, def.level + 10, k) > 0.55, `${def.name} +10 levels`); }
    if (def.level > 12) { assert.ok(mean(def, def.level - 10, k) < 0.45, `${def.name} -10 levels`); }
  });
});
