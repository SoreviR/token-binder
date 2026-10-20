import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addCards, Card, FindNext, grantPacks, newState, nextPackProgress, pickTier, resolveDue, rollPackTiers,
  stageEnd, startTraining, tierOf, trainingProgress, TIER_RARITIES,
} from '../src/game/engine';

const card = (id: string, name: string, rarity = 'Rare'): Card => ({ id, name, rarity, tier: tierOf(rarity), image: `https://x/${id}` });

test('tierOf agrupa rarezas conocidas y trata las desconocidas como Rara', () => {
  assert.equal(tierOf('Common'), 0);
  assert.equal(tierOf('uncommon'), 1);
  assert.equal(tierOf('Holo Rare VMAX'), 4);
  assert.equal(tierOf('Special illustration rare'), 5);
  assert.equal(tierOf('Hyper rare'), 6);
  assert.equal(tierOf('Algo Nuevo'), 2);
  assert.equal(tierOf(undefined), 2);
});

test('todas las rarezas de TCGdex están clasificadas (sin duplicados entre categorías)', () => {
  const all = TIER_RARITIES.flat().map(r => r.toLowerCase());
  assert.equal(new Set(all).size, all.length);
});

test('pickTier respeta los pesos', () => {
  const w: [number, number][] = [[0, 90], [5, 10]];
  assert.equal(pickTier(w, () => 0.0), 0);
  assert.equal(pickTier(w, () => 0.89), 0);
  assert.equal(pickTier(w, () => 0.95), 5);
});

test('un sobre tiene 5 cartas: 3 comunes, 1 poco común y 1 con posibilidad de rara', () => {
  const t = rollPackTiers(() => 0);
  assert.deepEqual(t, [0, 0, 0, 1, 2]);
  assert.equal(rollPackTiers(() => 0.999).at(-1), 6);
});

test('sobres por tokens: se conceden desde la línea base y no se repiten', () => {
  const s = newState(1_000_000);
  assert.equal(s.packs, 1);
  assert.equal(grantPacks(s, 1_000_000 + 749_999, 750_000), 0);
  assert.equal(grantPacks(s, 1_000_000 + 1_500_000, 750_000), 2);
  assert.equal(s.packs, 3);
  assert.equal(grantPacks(s, 1_000_000 + 1_500_000, 750_000), 0);
  assert.equal(Math.round(nextPackProgress(s, 1_000_000 + 1_875_000, 750_000).pct), 50);
});

test('entrenar: usa un hueco libre y no permite la misma carta dos veces', () => {
  const s = newState(0);
  addCards(s, [card('a', 'Charmander')]);
  assert.equal(startTraining(s, 'zzz', 0), false); // no está en la colección
  assert.equal(startTraining(s, 'a', 10), true);
  assert.equal(s.slots[0]?.born, 10);
  assert.equal(startTraining(s, 'a', 10), false); // hueco ocupado
});

test('etapas: la primera dura 1,5 M y el multiplicador la escala', () => {
  assert.equal(stageEnd(0, 1), 1_500_000);
  assert.equal(stageEnd(1, 1), 6_000_000);
  assert.equal(stageEnd(0, 2), 3_000_000);
  const s = newState(0);
  addCards(s, [card('a', 'Charmander')]);
  startTraining(s, 'a', 0);
  const p = trainingProgress(s.slots[0]!, 750_000, 1);
  assert.equal(Math.round(p.pct), 50);
  assert.equal(p.due, false);
  assert.equal(trainingProgress(s.slots[0]!, 1_500_000, 1).due, true);
});

test('resolveDue: evoluciona, y al terminar la línea gradúa y da un sobre', async () => {
  const s = newState(0);
  s.packs = 0;
  addCards(s, [card('a', 'Charmander')]);
  startTraining(s, 'a', 0);
  const chain: Record<string, Card | null> = { Charmander: card('b', 'Charmeleon'), Charmeleon: card('c', 'Charizard'), Charizard: null };
  const next: FindNext = async c => ({ ok: true, card: chain[c.name] ?? null });

  const ev1 = await resolveDue(s, 1_500_000, 1, next);
  assert.deepEqual(ev1, ['evolve:Charmeleon']);
  assert.equal(s.slots[0]?.card.name, 'Charmeleon');
  assert.ok(s.collection['b']);

  // Etapa 2 termina en 6 M, la 3 en 12 M: con 12 M se resuelven ambas de golpe.
  const ev2 = await resolveDue(s, 12_000_000, 1, next);
  assert.deepEqual(ev2, ['evolve:Charizard', 'graduate:Charizard']);
  assert.equal(s.slots[0], null);
  assert.equal(s.mastered, 1);
  assert.equal(s.packs, 1);
});

test('resolveDue: si la red falla no cambia nada (se reintenta luego)', async () => {
  const s = newState(0);
  addCards(s, [card('a', 'Pikachu')]);
  startTraining(s, 'a', 0);
  const ev = await resolveDue(s, 99_000_000, 1, async () => ({ ok: false }));
  assert.deepEqual(ev, []);
  assert.equal(s.slots[0]?.card.name, 'Pikachu');
  assert.equal(s.mastered, 0);
});
