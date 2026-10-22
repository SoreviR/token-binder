import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card, addCards, newState, tierOf } from '../src/game/engine';
import { clearShowcase, pinShowcase, showcaseKey, showcaseScore } from '../src/game/showcase';
import { gradeMultiplier } from '../src/game/grading';
import { XP_PER_LEVEL } from '../src/game/engine';
import { world } from './helpers/leagueWorld';

const card = (id: string, name: string, rarity: string, eur?: number): Card => ({ id, name, rarity, tier: tierOf(rarity), image: `https://x/${id}`, ...(eur ? { price: { eur } } : {}) });

test('showcase: the pinned card wins while you have it and it is dry; otherwise the most valuable one is chosen', () => {
  const s = newState(0);
  assert.equal(showcaseKey(s), undefined);
  addCards(s, [card('a-1', 'Cheap', 'Common', 1), card('a-2', 'Pricey', 'Rare', 50), card('a-3', 'Mid', 'Rare', 10)], 1);
  assert.equal(showcaseKey(s), 'a-2');
  assert.equal(pinShowcase(s, 'a-3'), true);
  assert.equal(showcaseKey(s), 'a-3');
  s.collection['a-3'].soaked = true;                                       // a wet pinned card is not shown: back to the best one
  assert.equal(showcaseKey(s), 'a-2');
  s.collection['a-3'].soaked = false;
  assert.equal(pinShowcase(s, 'zz'), false);
  clearShowcase(s);
  assert.equal(showcaseKey(s), 'a-2');
});

test('showcase: grade and wear change which card is the most valuable, and the rarest breaks a tie', () => {
  const s = newState(0);
  addCards(s, [card('b-1', 'Plain', 'Rare', 20), card('b-2', 'Graded', 'Rare', 15)], 1);
  assert.equal(showcaseKey(s), 'b-1');
  s.collection['b-2'].grade = 10;
  assert.ok(showcaseScore(s.collection['b-2']) > showcaseScore(s.collection['b-1']));
  assert.equal(showcaseKey(s), 'b-2');
  const t = newState(0);
  addCards(t, [card('c-1', 'NoPriceCommon', 'Common'), card('c-2', 'NoPriceRare', 'Ultra Rare')], 1);
  assert.equal(showcaseKey(t), 'c-2', 'with no prices the rarer card is chosen');
});

const claim = (key: string, level = 5) => {
  const xp = (level - 1) * XP_PER_LEVEL;
  return { key, xp, quotaPct: 60, profile: { coins: 100, cards: 5, items: 0, xp, tokens: xp + 1e6 } };
};

test('server: the showcase is checked for form, shown on the board and the public page with its estimated value, and deleted with the player', async () => {
  const w = await world();
  const created = await w.call('tokA', 'POST', '/leagues', { name: 'Pallet Town' });
  const code = created.body.league.code as string, id = created.body.league.id as number;
  await w.call('tokB', 'POST', '/leagues/join', { code });

  assert.equal((await w.call('tokA', 'PUT', '/showcase', { key: 'bad key!' })).body.error, 'invalid-card');
  assert.equal((await w.call('tokA', 'PUT', '/showcase', { key: 'base1-4', grade: 11 })).body.error, 'invalid-grade');
  assert.equal((await w.call('tokA', 'PUT', '/showcase', { key: 'nope-1' })).body.error, 'card-unavailable');
  assert.equal((await w.call(undefined, 'PUT', '/showcase', { key: 'base1-4' })).status, 401);

  const ok = await w.call('tokA', 'PUT', '/showcase', { key: 'base1-4', grade: 9 });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.showcase.name, 'Charizard');
  assert.equal(ok.body.showcase.grade, 9);
  assert.equal(ok.body.showcase.value, Math.round(200 * gradeMultiplier(9) * 100) / 100);

  const board = (await w.call('tokB', 'GET', `/leagues/${id}`)).body.members;
  const ash = board.find((m: { login: string }) => m.login === 'ash');
  const misty = board.find((m: { login: string }) => m.login === 'misty');
  assert.equal(ash.showcase.name, 'Charizard');
  assert.equal(misty.showcase, undefined);

  await w.call('tokA', 'PUT', '/showcase', { key: 'base1-58' });           // changing it replaces it
  const pub = (await w.call(undefined, 'GET', `/public/league?code=${code}`)).body;
  assert.equal(pub.members.find((m: { login: string }) => m.login === 'ash').showcase.name, 'Pikachu');
  assert.equal(pub.members.find((m: { login: string }) => m.login === 'ash').showcase.grade, undefined);

  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 5));
  await w.d.db.query('update players set busted = true where id = 1');     // flagged players show nothing
  assert.equal((await w.call('tokB', 'GET', `/leagues/${id}`)).body.members.find((m: { login: string }) => m.login === 'ash').showcase, undefined);
  await w.d.db.query('update players set busted = false where id = 1');

  await w.call('tokA', 'DELETE', '/me');
  assert.equal((await w.d.db.query('select 1 from showcases')).length, 0);
});
