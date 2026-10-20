import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLegacyState } from '../src/legacy';

// legacy.ts es la parte pura (sin vscode); migrate.ts, que sí usa la API de VS Code, se verifica a mano.
test('parseLegacyState: extrae el juego v2 y las fechas de la versión antigua', () => {
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

test('parseLegacyState: ignora el juego de sprites (v1), JSON roto y valores ausentes', () => {
  assert.equal(parseLegacyState(JSON.stringify({ 'pokeToken.game.v1': { egg: true } })).game, undefined);
  assert.deepEqual(parseLegacyState('{no es json'), {});
  assert.deepEqual(parseLegacyState(undefined), {});
  assert.equal(parseLegacyState(JSON.stringify({ 'pokeToken.game.v2': { v: 3, collection: {} } })).game, undefined);
});
