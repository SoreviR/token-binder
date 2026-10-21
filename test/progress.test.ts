import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accrueXp, addCards, Card, FindNext, keyOf, levelOf, levelProgress, MAX_LEVEL, newState, normalize, resolveDue, startTraining, tierOf, trainingProgress, untrain,
  XP_PER_LEVEL,
} from '../src/game/engine';
import { collectorLabel, marketValue, parseDamage, parsePricing, statsOf } from '../src/game/stats';

const card = (id: string, name: string, extra: Partial<Card> = {}): Card => ({ id, name, rarity: 'Rare', tier: tierOf('Rare'), image: `https://x/${id}`, ...extra });
const noNext: FindNext = async () => ({ ok: true, card: null });

test('nivel: 1 + un nivel por cada 400 K tokens, con tope en 50', () => {
  assert.equal(levelOf(0), 1);
  assert.equal(levelOf(XP_PER_LEVEL - 1), 1);
  assert.equal(levelOf(XP_PER_LEVEL), 2);
  assert.equal(levelOf(1e12), MAX_LEVEL);
  assert.equal(levelProgress(1e12), null);
  assert.equal(Math.round(levelProgress(XP_PER_LEVEL * 1.5)!.pct), 50);
});

test('XP: la carta en entrenamiento gana los tokens usados y sin entrenar no gana nada', () => {
  const s = newState(0);
  addCards(s, [card('a', 'Zapdos'), card('b', 'Pikachu')]);
  startTraining(s, 'a', 1_000_000);
  accrueXp(s, 1_800_000);
  assert.equal(s.collection['a'].xp, 800_000);
  assert.equal(s.collection['b'].xp, 0);
  accrueXp(s, 1_800_000);                       // repetir no suma otra vez
  assert.equal(s.collection['a'].xp, 800_000);
  assert.deepEqual(accrueXp(s, 1_800_000 + XP_PER_LEVEL).length, 1); // aviso de subida de nivel
});

test('evolucionar hereda la XP de la carta anterior', async () => {
  const s = newState(0);
  addCards(s, [card('a', 'Charmander')]);
  startTraining(s, 'a', 0);
  const next: FindNext = async c => ({ ok: true, card: c.name === 'Charmander' ? card('b', 'Charmeleon') : null });
  await resolveDue(s, 1_500_000, 1, next);
  assert.equal(s.slots[0]?.card.name, 'Charmeleon');
  assert.equal(s.collection['b'].xp, 1_500_000);
  assert.equal(levelOf(s.collection['b'].xp), 4);
});

test('línea sin evolución (Zapdos): se gradúa una vez, se queda de Maestra y sigue subiendo de nivel', async () => {
  const s = newState(0);
  s.packs = 0;
  addCards(s, [card('z', 'Zapdos')]);
  startTraining(s, 'z', 0);
  const ev = await resolveDue(s, 1_500_000, 1, noNext);
  assert.ok(ev.includes('graduate:Zapdos'));
  assert.equal(s.packs, 1);
  assert.equal(s.slots[0]?.mastered, true);
  assert.equal(s.collection['z'].mastered, true);
  assert.equal(trainingProgress(s.slots[0]!, 9e9, 1).due, false);

  await resolveDue(s, 5_000_000, 1, noNext);    // ya no gradúa otra vez ni da otro sobre
  assert.equal(s.packs, 1);
  assert.equal(s.mastered, 1);
  assert.equal(levelOf(s.collection['z'].xp), levelOf(5_000_000));
});

test('retirar libera el hueco, conserva la XP y volver a entrenarla no da otro sobre', async () => {
  const s = newState(0);
  addCards(s, [card('z', 'Zapdos')]);
  startTraining(s, 'z', 0);
  await resolveDue(s, 2_000_000, 1, noNext);
  const packs = s.packs, xp = s.collection['z'].xp;
  assert.equal(untrain(s, 'z'), true);
  assert.equal(s.slots[0], null);
  assert.equal(untrain(s, 'z'), false);
  assert.equal(s.collection['z'].xp, xp);
  assert.equal(startTraining(s, 'z', 2_000_000), true);
  assert.equal((s.slots as (typeof s.slots[number])[])[0]?.mastered, true);
  await resolveDue(s, 9_000_000, 1, noNext);
  assert.equal(s.packs, packs);
});

test('normalize: un estado anterior gana xp y last sin perder lo entrenado', () => {
  const old: any = {
    v: 2, baseline: 0, packsGranted: 0, packs: 0, collection: { a: { card: card('a', 'Eevee'), count: 1, firstAt: 0 } },
    slots: [{ card: card('a', 'Eevee'), born: 500_000, evolved: 0 }, null], mastered: 0, bonusPeriod: 0,
  };
  const s = normalize(old, 2_000_000);
  assert.equal(s.collection['a'].xp, 0);
  assert.equal(s.slots[0]?.last, 500_000);
  accrueXp(s, 2_000_000);
  assert.equal(s.collection['a'].xp, 1_500_000);
  assert.equal(keyOf(s.slots[0]!.card), 'a');
});

test('parseDamage entiende 20+, 30×, números y ataques sin daño', () => {
  assert.equal(parseDamage('20+'), 20);
  assert.equal(parseDamage('30×'), 30);
  assert.equal(parseDamage(120), 120);
  assert.equal(parseDamage(undefined), 0);
  assert.equal(parseDamage(''), 0);
});

test('stats: se normalizan por era y suben con el nivel', () => {
  const vintage = card('v', 'Charizard', { era: 'vintage', hp: 120, retreat: 3, attacks: [{ name: 'Fire Spin', damage: 100, cost: 4 }] });
  const vmax = card('m', 'Rayquaza VMAX', { era: 'modern', stage: 'VMAX', hp: 320, tier: 4, retreat: 2, attacks: [{ name: 'Max Burst', damage: 20, cost: 2 }] });
  const a = statsOf(vintage), b = statsOf(vmax);
  assert.ok(a.atk > b.atk, 'el daño bruto de la vintage pesa más contra la referencia de su era');
  assert.ok(Math.abs(a.hp - b.hp) / a.hp < 0.5, 'las PS no se disparan por la era');
  const lv10 = statsOf(vintage, 9 * XP_PER_LEVEL);
  assert.equal(lv10.level, 10);
  assert.ok(lv10.hp > a.hp && lv10.atk > a.atk && lv10.spd >= a.spd);
});

test('stats: sin datos de ataques se estima por rareza y no devuelve NaN', () => {
  const s = statsOf(card('x', 'Algo', { tier: 3 }));
  for (const v of Object.values(s)) { assert.ok(Number.isFinite(v) && v > 0); }
  assert.ok(statsOf(card('y', 'Algo', { tier: 6 })).atk > statsOf(card('y', 'Algo', { tier: 0 })).atk);
});

test('precios: tendencia de Cardmarket y el mayor marketPrice de TCGplayer; etiquetas de coleccionismo', () => {
  const p = parsePricing({
    cardmarket: { trend: 1161.33, avg30: 1050 },
    tcgplayer: { unit: 'USD', updated: 'x', holofoil: { marketPrice: 1278.52 }, normal: { marketPrice: 3.5 } },
  });
  assert.deepEqual(p, { eur: 1161.33, usd: 1278.52 });
  assert.deepEqual(parsePricing(undefined), {});
  assert.equal(marketValue({ price: { usd: 100 } }), 92);
  assert.equal(marketValue({}), undefined);
  assert.equal(collectorLabel({ price: { eur: 0.4 } }), 'Común de mercado');
  assert.equal(collectorLabel({ price: { eur: 30 } }), 'Muy cotizada');
  assert.equal(collectorLabel({ price: { eur: 1161 } }), 'Grail');
  assert.equal(collectorLabel({}), undefined);
});
