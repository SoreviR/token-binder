import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, progressOf, spawn, thresholds, LINES, GameState } from '../src/game/engine';

const fixedRng = (lineIdx: number) => { let i = 0; return () => (i++ === 0 ? lineIdx / LINES.length + 0.001 : 0.9); };
const mk = (lineIdx: number, born = 0): GameState => ({ current: { ...spawn(born, fixedRng(lineIdx)), born }, dex: [], candyPeriod: 0, hatchedCount: 0 });

test('huevo → eclosión → evolución por umbrales', () => {
  const s = mk(0); // Bulbasaur (3 etapas)
  assert.equal(progressOf(s.current, 0, 1).stage, 0);
  assert.equal(progressOf(s.current, 150_000, 1).stage, 1);
  assert.equal(progressOf(s.current, 1_500_000, 1).stage, 2);
  assert.equal(progressOf(s.current, 6_000_000, 1).stage, 3);
});

test('graduación: entra a la Pokédex y nace un huevo nuevo con el sobrante', () => {
  const s = mk(0);
  const end = thresholds(3, 1).at(-1)!;
  const { state, events } = advance(s, end + 10, 1, 1, 0, () => 0.5);
  assert.equal(state.dex.length, 1);
  assert.equal(state.dex[0].name, 'Venusaur');
  assert.equal(state.current.born, end);
  assert.ok(events.some(e => e.startsWith('graduate:')));
});

test('multiplicador escala los umbrales', () => {
  assert.deepEqual(thresholds(1, 2), [300_000, 300_000 + 16_000_000]);
});

test('Rare Candy se otorga una sola vez por periodo', () => {
  const s = mk(0);
  const a = advance(s, 0, 1, 7, 100);
  assert.ok(a.events.includes('candy'));
  const b = advance(a.state, 0, 1, 7, 100);
  assert.ok(!b.events.includes('candy'));
  assert.equal(a.state.current.born, -2_000_000);
});
