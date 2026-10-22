import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LEVEL, newState } from '../src/game/engine';
import { BOSS_ATTEMPTS, BOSS_REWARD, CUP_FEE, CUP_PRIZE, bossOfWeek, bossStatus, cupPlayedToday, cupRivals, enterCup, finishCup, recordBossBattle, recordCupRound, weekOf } from '../src/game/modes';

const DAY = 864e5;
const MON = new Date(2026, 9, 19, 12).getTime();   // a Monday (local time)

test('weekOf: the whole week (Monday to Sunday) shares a key and the next Monday starts a new one', () => {
  const w = weekOf(MON);
  for (let i = 0; i < 7; i++) { assert.equal(weekOf(MON + i * DAY).key, w.key); assert.equal(weekOf(MON + i * DAY).index, w.index); }
  assert.notEqual(weekOf(MON + 7 * DAY).key, w.key);
  assert.equal(weekOf(MON + 7 * DAY).index, w.index + 1);
  assert.equal(weekOf(MON - DAY).index, w.index - 1);   // the Sunday before belongs to the previous week
});

test('bossOfWeek: stable inside a week, different the next, always within the level cap', () => {
  assert.equal(bossOfWeek(MON).id, bossOfWeek(MON + 6 * DAY).id);
  assert.notEqual(bossOfWeek(MON).id, bossOfWeek(MON + 7 * DAY).id);
  for (let i = 0; i < 30; i++) { const b = bossOfWeek(MON + i * 7 * DAY); assert.ok(b.level <= MAX_LEVEL && b.level >= 1); assert.ok(b.id.startsWith('boss:')); }
});

test('boss: three attempts a week; only the first victory pays; a new week resets', () => {
  const s = newState(0);
  const def = bossOfWeek(MON);
  assert.equal(bossStatus(s, MON).attemptsLeft, BOSS_ATTEMPTS);
  const lost = recordBossBattle(s, def, 'Pikachu', false, 6, MON);
  assert.equal(lost.coins, 0);
  assert.equal(bossStatus(s, MON).attemptsLeft, BOSS_ATTEMPTS - 1);
  const won = recordBossBattle(s, def, 'Pikachu', true, 7, MON);
  assert.deepEqual([won.coins, won.boxes, won.firstWin], [BOSS_REWARD.coins, BOSS_REWARD.boxes, true]);
  assert.equal(s.coins, BOSS_REWARD.coins); assert.equal(s.boxes, BOSS_REWARD.boxes);
  const again = recordBossBattle(s, def, 'Pikachu', true, 7, MON + DAY);
  assert.equal(again.coins, 0);                                              // already beaten this week
  assert.equal(bossStatus(s, MON).attemptsLeft, 0);
  assert.equal(bossStatus(s, MON + 7 * DAY).attemptsLeft, BOSS_ATTEMPTS);   // next week: fresh
  assert.equal(bossStatus(s, MON + 7 * DAY).won, false);
  assert.equal(s.battle!.wins, 2); assert.equal(s.battle!.losses, 1);
});

test('cup: the fee is charged once a day and only if you can pay', () => {
  const s = newState(0);
  assert.deepEqual(enterCup(s, MON), { ok: false, reason: 'coins' });
  assert.equal(s.coins, 0); assert.equal(cupPlayedToday(s, MON), false);
  s.coins = CUP_FEE + 10;
  assert.deepEqual(enterCup(s, MON), { ok: true });
  assert.equal(s.coins, 10);
  assert.deepEqual(enterCup(s, MON), { ok: false, reason: 'played' });
  s.coins = 100;
  assert.deepEqual(enterCup(s, MON + 2 * 3600e3), { ok: false, reason: 'played' });   // same day
  assert.deepEqual(enterCup(s, MON + DAY), { ok: true });                              // next day
});

test('cup: prizes grow with the rounds won and a perfect cup gives a box', () => {
  for (let wins = 0; wins <= 3; wins++) {
    const s = newState(0);
    const r = finishCup(s, wins);
    assert.equal(r.coins, CUP_PRIZE[wins]); assert.equal(s.coins, CUP_PRIZE[wins]);
    assert.equal(r.boxes, wins === 3 ? 1 : 0);
  }
  assert.ok(CUP_PRIZE[1] <= CUP_FEE, 'one win never makes a profit');
});

test('cupRivals: three different rivals, each a little stronger, within the level range', () => {
  const rivals = cupRivals(20, () => 0.3);
  assert.equal(rivals.length, 3);
  assert.equal(new Set(rivals.map(r => r.species)).size, 3);
  assert.deepEqual(rivals.map(r => r.level), [19, 21, 23]);
  assert.deepEqual(cupRivals(1, () => 0.1).map(r => r.level), [1, 2, 4]);
  assert.deepEqual(cupRivals(50, () => 0.9).map(r => r.level), [49, 50, 50]);
});

test('cup rounds count in the record and history like any fight', () => {
  const s = newState(0);
  const [r1, r2] = cupRivals(10, () => 0.5);
  recordCupRound(s, r1, 'Pikachu', true, 6, MON);
  recordCupRound(s, r2, 'Pikachu', false, 8, MON);
  assert.equal(s.battle!.wins, 1); assert.equal(s.battle!.losses, 1); assert.equal(s.battle!.streak, 0);
  assert.equal(s.battle!.history.length, 2);
});
