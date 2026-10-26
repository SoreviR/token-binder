import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buy, consume, newState, priceOf, SPOOKY_PRICE } from '../src/game/engine';
import { HW_ATTEMPTS, HW_REWARD, grantHwGift, halloweenActive, hwStatus, recordHwBattle } from '../src/game/halloween';
import { buyFrame, equipFrame } from '../src/game/cosmetics';

const at = (d: string) => new Date(`${d}T12:00:00`).getTime();

test('halloween: active only from Oct 26 to Nov 3 (local dates)', () => {
  assert.equal(halloweenActive(at('2026-10-25')), false);
  assert.equal(halloweenActive(at('2026-10-26')), true);
  assert.equal(halloweenActive(at('2026-11-03')), true);
  assert.equal(halloweenActive(at('2026-11-04')), false);
});

test('halloween: the free pack is given once, and only during the event', () => {
  const s = newState(0);
  assert.equal(grantHwGift(s, at('2026-10-25')), false);
  assert.equal(grantHwGift(s, at('2026-10-27')), true);
  assert.equal(grantHwGift(s, at('2026-10-28')), false);
  assert.equal(s.spooky, 1);
});

test('halloween: the pack is only sold during the event, but a bought one can be opened later', () => {
  const s = newState(0);
  s.coins = 1000;
  assert.equal(priceOf(s, 'spooky', false), null);
  assert.equal(buy(s, 'spooky', false), false);
  assert.equal(buy(s, 'spooky', true), true);
  assert.equal(s.coins, 1000 - SPOOKY_PRICE);
  assert.equal(consume(s, 'spooky'), true);
  assert.equal(consume(s, 'spooky'), false);
});

test('halloween boss: three attempts a day, the first victory pays once', () => {
  const s = newState(0);
  const day = at('2026-10-27');
  assert.equal(hwStatus(s, day).attemptsLeft, HW_ATTEMPTS);
  const a = recordHwBattle(s, 'Gengar', true, 5, day);
  assert.equal(a.firstWin, true);
  assert.equal(s.coins, HW_REWARD.coins);
  assert.equal(s.boxes, HW_REWARD.boxes);
  assert.equal(s.spooky, HW_REWARD.spooky);
  const b = recordHwBattle(s, 'Gengar', true, 5, day);
  assert.equal(b.firstWin, false);
  assert.equal(s.coins, HW_REWARD.coins);
  recordHwBattle(s, 'Gengar', false, 5, day);
  assert.equal(hwStatus(s, day).attemptsLeft, 0);
  assert.equal(hwStatus(s, at('2026-10-28')).attemptsLeft, HW_ATTEMPTS);
});

test('halloween: the pumpkin frame is sold only during the event and kept after it', () => {
  const s = newState(0);
  s.coins = 5000;
  assert.equal(buyFrame(s, 'pumpkin', at('2026-11-10')), false);
  assert.equal(buyFrame(s, 'pumpkin', at('2026-10-30')), true);
  assert.equal(equipFrame(s, ''), true);
  assert.equal(equipFrame(s, 'pumpkin'), true);
});
