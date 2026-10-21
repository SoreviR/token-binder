import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addCards, Card, ERAS, ERA_BY_ID, eraOfSerie, isPremium, keyOf, newState, pickEra, rollEras, rollVariant, sellDuplicates, sellValue,
  shuffledRarities, startTraining, tierOf,
} from '../src/game/engine';

const card = (over: Partial<Card> = {}): Card => ({ id: 'base1-4', name: 'Charizard', rarity: 'Rare', tier: 3, era: 'vintage', holo: true, image: 'x', ...over });

test('eras: every TCGdex series belongs to one era and excluded ones have none', () => {
  const all = ERAS.flatMap(e => e.series);
  assert.equal(new Set(all).size, all.length);
  assert.equal(eraOfSerie('base'), 'vintage');
  assert.equal(eraOfSerie('ex'), 'classic');
  assert.equal(eraOfSerie('sv'), 'current');
  for (const excluida of ['tcgp', 'misc', 'mc', 'tk', 'pop']) { assert.equal(eraOfSerie(excluida), undefined); }
});

test('premium filter: vintage requires holo; modern requires high rarities; commons never', () => {
  assert.equal(isPremium(card()), true);                                 // holo vintage ("Rare" + holo)
  assert.equal(isPremium(card({ holo: false })), false);                 // Rare without holo
  assert.equal(isPremium(card({ rarity: 'Common' })), false);
  assert.equal(isPremium(card({ era: 'current', rarity: 'Special illustration rare', holo: true })), true);
  assert.equal(isPremium(card({ era: 'current', rarity: 'Double rare' })), false);   // plain ex: not premium
  assert.equal(isPremium(card({ era: 'modern', rarity: 'Holo Rare VMAX' })), true);
  assert.equal(isPremium(card({ era: undefined })), false);
});

test('the more modern the era, the higher the average rarity (and there are never commons)', () => {
  // In holoOnly eras the card is at least "Holo" even if its rarity just says "Rare".
  const mean = (id: keyof typeof ERA_BY_ID) => {
    const e = ERA_BY_ID[id];
    const tier = (r: string) => Math.max(tierOf(r), e.holoOnly ? 3 : 0);
    return e.rarities.reduce((s, [r, w]) => s + tier(r) * w, 0) / e.rarities.reduce((s, [, w]) => s + w, 0);
  };
  const order = ['vintage', 'classic', 'bwxy', 'modern', 'current'] as const;
  for (let k = 1; k < order.length; k++) { assert.ok(mean(order[k]) > mean(order[k - 1]), order[k] + ' must be rarer than ' + order[k - 1]); }
  for (const e of ERAS) { assert.ok(e.rarities.every(([r]) => !['Common', 'Uncommon'].includes(r))); }
  assert.ok(ERA_BY_ID.vintage.holoOnly && ERA_BY_ID.classic.holoOnly && !ERA_BY_ID.current.holoOnly);
});

test('packs: 2 cards (premium leaning modern), Poké Ball 1; luck favors modern', () => {
  assert.equal(rollEras('pack', 0, () => 0).length, 2);
  assert.equal(rollEras('premium', 0, () => 0).length, 2);
  assert.equal(rollEras('ball', 0, () => 0).length, 1);
  const count = (luck: number) => {
    let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let n = 0; for (let i = 0; i < 4000; i++) { const e = pickEra({ vintage: 34, classic: 28, bwxy: 16, modern: 14, current: 8 }, luck, rng); if (e === 'modern' || e === 'current') n++; }
    return n;
  };
  assert.ok(count(5) > count(0) * 1.25);
});

test('shuffledRarities returns every rarity of the era once', () => {
  const r = shuffledRarities('current', () => 0.5);
  assert.deepEqual([...r].sort(), ERA_BY_ID.current.rarities.map(([x]) => x).sort());
});

test('Shadowless variants: only if the card exists that way; luck raises the probability', () => {
  assert.equal(rollVariant({ shadowless: false }, 5, () => 0), undefined);
  assert.equal(rollVariant({ shadowless: true }, 0, () => 0.01), 'first');
  assert.equal(rollVariant({ shadowless: true }, 0, () => 0.2), 'shadowless');
  assert.equal(rollVariant({ shadowless: true }, 0, () => 0.9), undefined);
  assert.equal(rollVariant({ shadowless: true }, 5, () => 0.55), 'shadowless'); // with luck 5 the range reaches 0.6
  assert.equal(rollVariant({ shadowless: true }, 0, () => 0.55), undefined);
});

test('a variant is a different card in the album and can be trained by its key', () => {
  const s = newState(0);
  const normal = card(), first = card({ variant: 'first' });
  assert.equal(keyOf(normal), 'base1-4');
  assert.equal(keyOf(first), 'base1-4#first');
  addCards(s, [normal, first, normal]);
  assert.equal(Object.keys(s.collection).length, 2);
  assert.equal(s.collection['base1-4'].count, 2);
  assert.equal(startTraining(s, 'base1-4#first', 0), true);
  assert.equal(startTraining(s, 'base1-4#first', 0), false);
});

test('selling duplicates: keeps one copy, pays by rarity and variant', () => {
  const s = newState(0);
  addCards(s, [card({ tier: 3 }), card({ tier: 3 }), card({ tier: 3 })]);
  assert.equal(sellValue({ tier: 3 }), 30);
  assert.equal(sellValue({ tier: 3, variant: 'shadowless' }), 60);
  assert.equal(sellValue({ tier: 3, variant: 'first' }), 150);
  assert.equal(sellDuplicates(s, 'otra'), 0);
  assert.equal(sellDuplicates(s, 'base1-4'), 60);   // 2 copies × 30
  assert.equal(s.collection['base1-4'].count, 1);
  assert.equal(s.coins, 60);
  assert.equal(sellDuplicates(s), 0);               // no duplicates left
});
