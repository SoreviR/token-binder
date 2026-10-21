import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Card, FindNext, XP_PER_LEVEL, accrueXp, addCards, applyTransform, branchOptions, buy, chooseEvolution, countOf, grantItem, keyOf, levelOf, newState, normalize,
  openBox, resolveDue, startTraining, takeItem, tierOf, useLuckyEgg, useRareCandy, LUCKY_EGG_TOKENS,
} from '../src/game/engine';
import { BOX_PRICE, ITEM_LIST, MIN_TRANSFORM_LEVEL, TRANSFORM_BY_ITEM, baseName, branchItem, canTransform, rollBox, transformNames } from '../src/game/items';

const card = (id: string, name: string, extra: Partial<Card> = {}): Card => ({ id, name, rarity: 'Rare', tier: tierOf('Rare'), image: `https://x/${id}`, ...extra });

test('baseName reduces the card-type decorations of real TCGdex names to the species', () => {
  const cases: [string, string][] = [
    ['Flareon', 'Flareon'], ['Flareon ex', 'Flareon'], ['Leafeon GX', 'Leafeon'], ['Leafeon-GX', 'Leafeon'], ['Espeon δ', 'Espeon'],
    ['Dark Vaporeon', 'Vaporeon'], ['Light Jolteon', 'Jolteon'], ["Lt. Surge's Jolteon", 'Jolteon'], ["Erika's Vileplume", 'Vileplume'],
    ['Mega Gardevoir ex', 'Gardevoir'], ['Gardevoir ex δ', 'Gardevoir'], ['M Rayquaza EX', 'Rayquaza'], ['Rayquaza VMAX', 'Rayquaza'],
    ['Rayquaza-EX', 'Rayquaza'], ['Alolan Raichu ex', 'Alolan Raichu'], ['Mr. Mime', 'Mr. Mime'], ['Farfetch\'d', 'Farfetch\'d'], ['Charizard', 'Charizard'],
  ];
  for (const [input, expected] of cases) { assert.equal(baseName(input), expected, input); }
});

test('the branch table maps each Eevee species to one distinct item and the other lines to theirs', () => {
  const eevee = ['Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'];
  const items = eevee.map(e => branchItem('Eevee', e));
  assert.ok(items.every(Boolean));
  assert.equal(new Set(items).size, 8);
  assert.equal(branchItem('Eevee ex', 'Umbreon'), 'moon-stone');      // decorated card names resolve to the species
  assert.equal(branchItem('Gloom', 'Bellossom'), 'sun-stone');
  assert.equal(branchItem('Slowpoke', 'Slowbro'), undefined);         // the free branch of a line
  assert.equal(branchItem('Pikachu', 'Raichu'), undefined);
});

test('mystery box: price is fixed, content is weighted, and luck favors the rare transformation items', () => {
  const s = newState(0);
  s.coins = BOX_PRICE - 1;
  assert.equal(buy(s, 'box'), false);
  s.coins = BOX_PRICE;
  assert.equal(buy(s, 'box'), true);
  assert.equal(s.boxes, 1);
  assert.equal(s.coins, 0);

  const ids = new Set<string>(ITEM_LIST.map(i => i.id));
  for (let i = 0; i <= 100; i++) { assert.ok(ids.has(rollBox(0, () => i / 100)), 'valid item'); }
  assert.equal(rollBox(0, () => 0), 'fire-stone');           // first entry at the low end
  const rare = (luck: number) => { let n = 0; for (let i = 0; i < 10_000; i++) { const id = rollBox(luck, () => (i + 0.5) / 10_000); if (id.endsWith('band') || id.endsWith('orb') || id.endsWith('core') || id === 'mega-stone') n++; } return n; };
  assert.ok(rare(5) > rare(0) * 1.4, 'luck 5 should raise the share of transformation items clearly');
});

test('openBox consumes a box, adds the item to the inventory, and does nothing without boxes', () => {
  const s = newState(0);
  assert.equal(openBox(s), null);
  s.boxes = 2;
  const found = openBox(s, () => 0)!;
  assert.equal(found, 'fire-stone');
  assert.equal(s.boxes, 1);
  assert.equal(countOf(s, found), 1);
  assert.equal(takeItem(s, found), true);
  assert.equal(takeItem(s, found), false);
  assert.deepEqual(s.items, {});
});

test('Rare Candy raises exactly one level, needs the item and stops at the maximum', () => {
  const s = newState(0);
  addCards(s, [card('a', 'Zapdos')]);
  assert.equal(useRareCandy(s, 'a'), false);                  // no item
  grantItem(s, 'rare-candy', 2);
  s.collection['a'].xp = XP_PER_LEVEL * 3 + 123_456;           // level 4, partway
  assert.equal(useRareCandy(s, 'a'), true);
  assert.equal(levelOf(s.collection['a'].xp), 5);
  assert.equal(s.collection['a'].xp, XP_PER_LEVEL * 4);        // start of level 5
  assert.equal(countOf(s, 'rare-candy'), 1);
  s.collection['a'].xp = XP_PER_LEVEL * 60;
  assert.equal(useRareCandy(s, 'a'), false);                  // already level 50: the candy is kept
  assert.equal(countOf(s, 'rare-candy'), 1);
  assert.equal(useRareCandy(s, 'nope'), false);
});

test('Lucky Egg doubles the XP of the next 1M tokens of a card in training, and stacks', () => {
  const s = newState(0);
  addCards(s, [card('a', 'Zapdos'), card('b', 'Pikachu')]);
  startTraining(s, 'a', 0);
  assert.equal(useLuckyEgg(s, 'a'), false);                   // no egg
  grantItem(s, 'lucky-egg', 2);
  assert.equal(useLuckyEgg(s, 'b'), false);                   // not training
  assert.equal(useLuckyEgg(s, 'a'), true);
  accrueXp(s, 600_000);
  assert.equal(s.collection['a'].xp, 1_200_000);              // 600K tokens counted twice
  assert.equal(s.slots[0]?.boost, LUCKY_EGG_TOKENS - 600_000);
  accrueXp(s, 1_500_000);                                     // 400K more at double, then 500K normal
  assert.equal(s.collection['a'].xp, 1_200_000 + 800_000 + 500_000);
  assert.equal(s.slots[0]?.boost, undefined);
  assert.equal(useLuckyEgg(s, 'a'), true);
  assert.equal(useLuckyEgg(s, 'a'), false);
});

const eeveeBranches = ['Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'];

test('a branching line waits for the player, asks only once, and evolves into the chosen species', async () => {
  const s = newState(0);
  addCards(s, [card('e', 'Eevee')]);
  startTraining(s, 'e', 0);
  const calls: (string | undefined)[] = [];
  const next: FindNext = async (c, pick) => {
    calls.push(pick);
    return pick ? { ok: true, card: card('u', pick) } : { ok: true, branches: eeveeBranches };
  };

  const ev = await resolveDue(s, 2_000_000, 1, next);
  assert.deepEqual(ev, ['branch:Eevee']);
  assert.deepEqual(s.slots[0]?.pending, eeveeBranches);
  assert.deepEqual(branchOptions(s.slots[0]!).find(o => o.name === 'Umbreon'), { name: 'Umbreon', item: 'moon-stone' });
  assert.deepEqual(await resolveDue(s, 3_000_000, 1, next), []);   // still waiting: no more lookups, no repeated notice
  assert.equal(calls.length, 1);
  assert.equal(s.slots[0]?.card.name, 'Eevee');

  assert.deepEqual(chooseEvolution(s, 'e', 'Pikachu'), { ok: false, reason: 'invalid' });
  assert.deepEqual(chooseEvolution(s, 'e', 'Umbreon'), { ok: false, reason: 'item' });   // no Moon Stone
  assert.ok(s.slots[0]?.pending, 'a failed choice keeps waiting');
  grantItem(s, 'moon-stone');
  assert.deepEqual(chooseEvolution(s, 'e', 'Umbreon'), { ok: true, name: 'Umbreon' });
  assert.equal(countOf(s, 'moon-stone'), 0);                       // the item is spent

  assert.deepEqual(await resolveDue(s, 3_000_000, 1, next), ['evolve:Umbreon']);
  assert.equal(calls[1], 'Umbreon');
  assert.equal(s.slots[0]?.card.name, 'Umbreon');
  assert.equal(s.slots[0]?.pending, undefined);
  assert.equal(s.slots[0]?.pick, undefined);
  assert.equal(chooseEvolution(s, 'u', 'natural').ok, false);      // nothing pending any more
});

test('natural evolution is free and picks one of the branches; a free branch needs no item', async () => {
  const s = newState(0);
  addCards(s, [card('s', 'Slowpoke')]);
  startTraining(s, 's', 0);
  const next: FindNext = async (c, pick) => (pick ? { ok: true, card: card('x', pick) } : { ok: true, branches: ['Slowbro', 'Slowking'] });
  await resolveDue(s, 2_000_000, 1, next);
  assert.deepEqual(chooseEvolution(s, 's', 'Slowbro'), { ok: true, name: 'Slowbro' });   // no item required for this one

  const t = newState(0);
  addCards(t, [card('s', 'Slowpoke')]);
  startTraining(t, 's', 0);
  await resolveDue(t, 2_000_000, 1, next);
  const r = chooseEvolution(t, 's', 'natural', () => 0.99);
  assert.deepEqual(r, { ok: true, name: 'Slowking' });
  assert.equal(countOf(t, 'kings-rock'), 0);
});

test('a network failure while looking for branches changes nothing', async () => {
  const s = newState(0);
  addCards(s, [card('e', 'Eevee')]);
  startTraining(s, 'e', 0);
  assert.deepEqual(await resolveDue(s, 2_000_000, 1, async () => ({ ok: false })), []);
  assert.equal(s.slots[0]?.pending, undefined);
});

test('canTransform: only finished cards of level 20+ that are not already a transformed form', () => {
  const lv = (level: number, mastered = true) => ({ mastered, level });
  assert.equal(canTransform(card('a', 'Rayquaza', { stage: 'Basic' }), lv(MIN_TRANSFORM_LEVEL), 'vmax'), true);
  assert.equal(canTransform(card('a', 'Rayquaza'), lv(MIN_TRANSFORM_LEVEL - 1), 'vmax'), false);
  assert.equal(canTransform(card('a', 'Rayquaza'), lv(50, false), 'vmax'), false);
  assert.equal(canTransform(card('a', 'Rayquaza VMAX', { stage: 'VMAX' }), lv(50), 'vstar'), false);
  assert.equal(canTransform(card('a', 'M Rayquaza EX', { stage: 'MEGA' }), lv(50), 'mega'), false);
  assert.equal(canTransform(card('a', 'Gardevoir ex'), lv(50), 'tera'), false);
  assert.equal(canTransform(card('a', 'Gardevoir ex'), lv(50), 'vmax'), true);
  assert.deepEqual(transformNames('Rayquaza', 'mega'), ['M Rayquaza EX', 'Mega Rayquaza ex']);
  assert.deepEqual(transformNames('Rayquaza', 'vmax'), ['Rayquaza VMAX']);
});

test('applyTransform: the new card inherits the level, is finished, takes the training slot and the item is spent', () => {
  const s = newState(0);
  const old = card('r1', 'Rayquaza', { stage: 'Basic' });
  addCards(s, [old]);
  s.collection['r1'].xp = XP_PER_LEVEL * 24;
  s.collection['r1'].mastered = true;
  startTraining(s, 'r1', 0);
  const mega = card('r2', 'M Rayquaza EX', { stage: 'MEGA' });

  assert.equal(applyTransform(s, 'r1', 'mega-stone', mega), null);          // no item: nothing happens
  assert.ok(!('r2' in s.collection));
  grantItem(s, 'mega-stone');
  assert.equal(applyTransform(s, 'r1', 'mega-stone', mega), 'r2');
  assert.equal(countOf(s, 'mega-stone'), 0);
  assert.equal(levelOf(s.collection['r2'].xp), 25);
  assert.equal(s.collection['r2'].mastered, true);
  assert.equal(s.collection['r1'].count, 1);                                  // the original stays in the album
  assert.equal(keyOf(s.slots[0]!.card), 'r2');
  assert.equal(s.slots[0]?.mastered, true);

  grantItem(s, 'mega-stone');
  assert.equal(applyTransform(s, 'r2', 'mega-stone', mega), null);            // same card: refused, item kept
  assert.equal(countOf(s, 'mega-stone'), 1);
});

test('normalize gives an older state an empty inventory and no boxes', () => {
  const old: any = { v: 2, baseline: 0, packsGranted: 0, packs: 0, collection: {}, slots: [null], mastered: 0, bonusPeriod: 0 };
  const s = normalize(old, 0);
  assert.deepEqual([s.boxes, s.items], [0, {}]);
});

test('the webview copy of the transform table and the item icons match the engine', () => {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const vm = require('node:vm') as typeof import('node:vm');
  const sandbox: any = { window: {}, document: {} };
  for (const f of ['i18n.js', 'common.js']) { vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'media', f), 'utf8'), sandbox); }
  const PT = sandbox.window.PT;
  assert.deepEqual(Object.fromEntries(Object.entries(PT.TRANSFORM_ITEM).map(([kind, item]) => [item, kind])), TRANSFORM_BY_ITEM);
  for (const { id } of ITEM_LIST) { assert.notEqual(PT.itemIcon(id), '🎁', `no icon for ${id}`); }
});
