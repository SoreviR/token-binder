import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLegacyState } from '../src/legacy';

// legacy.ts is the pure part (no vscode); migrate.ts, which does use the VS Code API, is verified by hand.
test('parseLegacyState: extracts the v2 game and the dates from the old version', () => {
  const stored = JSON.stringify({
    'pokeToken.game.v1': { egg: true },
    'pokeToken.game.v2': { v: 2, collection: { a: { count: 1 } }, coins: 12, slots: [null] },
    'pokeToken.stamps.v1': { baselined: true, firstSeen: { k: 1 } },
    'pokeToken.alerts.v1': { period: 1, fired: [50] },
  });
  const s = parseLegacyState(stored) as any;
  assert.equal(s.game.coins, 12);
  assert.equal(s.stamps.baselined, true);
  assert.deepEqual(s.alerts.fired, [50]);
});

test('parseLegacyState: ignores the sprites game (v1), broken JSON and missing values', () => {
  assert.equal(parseLegacyState(JSON.stringify({ 'pokeToken.game.v1': { egg: true } })).game, undefined);
  assert.deepEqual(parseLegacyState('{no es json'), {});
  assert.deepEqual(parseLegacyState(undefined), {});
  assert.equal(parseLegacyState(JSON.stringify({ 'pokeToken.game.v2': { v: 3, collection: {} } })).game, undefined);
});
