import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState } from '../src/game/engine';
import { FRAMES, buyFrame, equipFrame, isFrameId, ownsFrame } from '../src/game/cosmetics';

test('frames: buying charges the price once, puts the frame on and cannot be repeated', () => {
  const s = newState(0);
  const gold = FRAMES.find(f => f.id === 'gold')!;
  assert.equal(buyFrame(s, 'gold'), false);                  // no coins
  s.coins = gold.price + 5;
  assert.equal(buyFrame(s, 'gold'), true);
  assert.equal(s.coins, 5);
  assert.equal(s.cosmetics!.frame, 'gold');
  assert.equal(ownsFrame(s, 'gold'), true);
  s.coins = 1000;
  assert.equal(buyFrame(s, 'gold'), false);                  // already yours: not charged again
  assert.equal(s.coins, 1000);
  assert.equal(buyFrame(s, 'nope'), false);
});

test('frames: you can only put on a frame you own, and take it off', () => {
  const s = newState(0);
  assert.equal(equipFrame(s, 'neon'), false);
  s.coins = 5000;
  buyFrame(s, 'gold'); buyFrame(s, 'neon');
  assert.equal(s.cosmetics!.frame, 'neon');
  assert.equal(equipFrame(s, 'gold'), true);
  assert.equal(s.cosmetics!.frame, 'gold');
  assert.equal(equipFrame(s, ''), true);
  assert.equal(s.cosmetics!.frame, undefined);
  assert.ok(isFrameId('rainbow') && !isFrameId('x') && !isFrameId(3));
});
