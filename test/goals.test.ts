import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card, addCards, newState, normalize, tierOf } from '../src/game/engine';
import { GOALS, checkGoals, progressOf } from '../src/game/goals';
import { noteRecap, recapView } from '../src/game/recap';

const card = (id: string, name: string, rarity = 'Common', types?: string[]): Card => ({ id, name, rarity, tier: tierOf(rarity), image: `https://x/${id}`, types });
const goal = (id: string) => GOALS.find(g => g.id === id)!;

test('goals: ids are unique and every one has a reachable target and a reward', () => {
  assert.equal(new Set(GOALS.map(g => g.id)).size, GOALS.length);
  for (const g of GOALS) { assert.ok(g.goal > 0); assert.ok(Object.values(g.reward).some(v => (v ?? 0) > 0), g.id); }
});

test('goals: reaching one pays its reward once and reports it', () => {
  const s = newState(0);
  assert.deepEqual(checkGoals(s, 1), []);                                  // nothing reached yet
  s.battle!.wins = 1;
  assert.deepEqual(checkGoals(s, 2), ['goal:wins1']);
  assert.equal(s.coins, goal('wins1').reward.coins);
  assert.deepEqual(checkGoals(s, 3), []);                                  // never paid twice
  assert.equal(s.coins, goal('wins1').reward.coins);
});

test('goals: progress counts distinct cards and types, and is capped at the target', () => {
  const s = newState(0);
  addCards(s, [card('a-1', 'A', 'Common', ['Fire']), card('a-2', 'B', 'Common', ['Fire', 'Water']), card('a-3', 'C', 'Common', ['Grass'])], 1);
  assert.equal(progressOf(s, goal('collect10')), 3);
  assert.equal(progressOf(s, goal('types')), 3);
  s.battle!.wins = 500;
  assert.equal(progressOf(s, goal('wins50')), 50);
});

test('goals: a save from before goals existed records what is met without paying or announcing it', () => {
  const s = newState(0);
  delete s.goals;
  s.battle!.wins = 12;
  const coins = s.coins;
  assert.deepEqual(checkGoals(s, 5), []);
  assert.equal(s.coins, coins);
  assert.ok(s.goals!.wins1 && s.goals!.wins10);
  s.battle!.wins = 50;
  assert.deepEqual(checkGoals(s, 6), ['goal:wins50']);                      // from then on they pay normally
});

test('tour: new players see the guide, players who already own cards do not', () => {
  assert.equal(newState(0).tour, false);
  const old = newState(0);
  addCards(old, [card('a-1', 'A')], 1);
  delete old.tour;
  assert.equal(normalize(old, 0).tour, true);
  const empty = newState(0);
  delete empty.tour;
  assert.equal(normalize(empty, 0).tour, false);
});

test('recap: keeps only what is worth reporting and summarises it', () => {
  const s = newState(0);
  noteRecap(s, ['tick', 'branch:Eevee'], 10);
  assert.equal(recapView(s), undefined);                                    // nothing reportable: no card
  s.coins = 5;
  noteRecap(s, ['packs:2', 'bonusPack', 'level:Pikachu:3', 'evolve:Raichu'], 20);
  noteRecap(s, ['level:Pikachu:5', 'graduate:Raichu', 'graded:9:1:Zapdos', 'goal:wins1'], 30);
  s.coins = 47.9;
  const v = recapView(s)!;
  assert.equal(v.since, 20);
  assert.equal(v.packs, 3);
  assert.equal(v.coins, 42);
  assert.deepEqual(v.levels, ['Pikachu 5']);                               // only the highest level of each card
  assert.deepEqual(v.evolved, ['Raichu']);
  assert.deepEqual(v.graduated, ['Raichu']);
  assert.equal(v.graded, 1);
  assert.deepEqual(v.goals, ['wins1']);
  delete s.recap;
  assert.equal(recapView(s), undefined);
});
