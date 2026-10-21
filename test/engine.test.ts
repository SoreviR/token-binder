import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addCards, Card, FindNext, grantPacks, newState, nextPackProgress, resolveDue,
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
  assert.equal(s.slots[0]?.mastered, true);   // se queda en el hueco como Maestra
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

/* ───── Fase 2: monedas, tienda y suerte ───── */
import { buy, consume, earnCoins, MAX_SLOTS, normalize, priceOf, underPace } from '../src/game/engine';
import { periodEnd, periodStart } from '../src/quota';

test('monedas: 1 cada 10 K tokens, +20 % con el bonus de ritmo, sin retroactivo', () => {
  const s = newState(500_000);
  assert.equal(earnCoins(s, 500_000, false), 0);
  assert.equal(earnCoins(s, 600_000, false), 10);
  assert.equal(earnCoins(s, 700_000, true), 12);
  assert.equal(s.coins, 22);
  assert.equal(earnCoins(s, 650_000, false), 0); // los tokens nunca bajan: no resta ni duplica
});

test('underPace compara el % de cupo con el % del periodo transcurrido', () => {
  const start = Date.UTC(2026, 9, 1), end = Date.UTC(2026, 10, 1); // octubre
  const mid = Date.UTC(2026, 9, 16, 12);                           // ≈ 50 % del mes
  assert.equal(underPace(40, mid, start, end), true);
  assert.equal(underPace(60, mid, start, end), false);
  assert.equal(underPace(0, start, start, end), true);
  assert.equal(underPace(1, start, start, end), false);
});

test('periodEnd es el inicio del periodo siguiente', () => {
  const now = Date.UTC(2026, 9, 20);
  assert.equal(periodStart(now, 1), Date.UTC(2026, 9, 1));
  assert.equal(periodEnd(now, 1), Date.UTC(2026, 10, 1));
  assert.equal(periodEnd(now, 25), Date.UTC(2026, 9, 25)); // 20-oct con reinicio el 25: periodo 25-sep → 25-oct
});

test('tienda: compra solo con monedas suficientes y descuenta el precio', () => {
  const s = newState(0);
  s.coins = 100;
  assert.equal(buy(s, 'premium'), false);  // cuesta 250
  assert.equal(buy(s, 'pack'), true);      // 80
  assert.equal(s.packs, 2);
  assert.equal(s.coins, 20);
  assert.equal(buy(s, 'ball'), true);      // 15
  assert.equal(s.balls, 1);
});

test('suerte: 5 niveles máximo', () => {
  const s = newState(0);
  s.coins = 1e9;
  for (let i = 0; i < 5; i++) { assert.equal(buy(s, 'luck'), true); }
  assert.equal(s.luck, 5);
  assert.equal(buy(s, 'luck'), false);
});

test('huecos: el precio sube y se detiene en el máximo', () => {
  const s = newState(0);
  s.coins = 1e9;
  assert.equal(priceOf(s, 'slot'), 400);
  while (s.slots.length < MAX_SLOTS) { assert.equal(buy(s, 'slot'), true); }
  assert.equal(s.slots.length, MAX_SLOTS);
  assert.equal(priceOf(s, 'slot'), null);
  assert.equal(buy(s, 'slot'), false);
});

test('consume descuenta del inventario correcto y no baja de cero', () => {
  const s = newState(0);
  assert.equal(consume(s, 'pack'), true);
  assert.equal(consume(s, 'pack'), false);
  assert.equal(consume(s, 'ball'), false);
});

test('normalize: un estado de la Fase 1 gana los campos nuevos sin monedas retroactivas', () => {
  const old: any = { v: 2, baseline: 0, packsGranted: 2, packs: 3, collection: {}, slots: [null], mastered: 0, bonusPeriod: 0 };
  const s = normalize(old, 9_000_000);
  assert.deepEqual([s.coins, s.premium, s.balls, s.luck, s.lastLifetime], [0, 0, 0, 0, 9_000_000]);
  assert.equal(s.packs, 3);
});
