import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card, GameState, addCards, newState, tierOf } from '../src/game/engine';
import { Fighter, makeFighter, simulate } from '../src/game/battle';
import { LEADERS, battleOf, setFighter } from '../src/game/leaders';
import { TEAM_EXTRAS, addToTeam, canJoinTeam, estimateTeamWin, removeFromTeam, simulateTeam, teamKeys } from '../src/game/team';
import { ELITE, ELITE_REMATCH, ELITE_REMATCH_DAILY, eliteBeaten, eliteCards, eliteUnlocked, recordEliteBattle } from '../src/game/elite';

const card = (id: string, name: string, rarity = 'Rare'): Card => ({ id, name, rarity, tier: tierOf(rarity), image: `https://x/${id}`, hp: 80, stage: 'Basic', types: ['Fire'], attacks: [{ name: 'Hit', damage: 30, cost: 1 }] });
const fighter = (id: string, level: number): Fighter => makeFighter(id, card(id, id), (level - 1) * 400_000);
const withCards = (...ids: string[]): GameState => {
  const s = newState(0);
  addCards(s, ids.map(i => card(i, i)), 1);
  return s;
};

test('simulate: a fighter can start hurt, the bars still use the full HP and the default is unchanged', () => {
  const a = fighter('a-1', 20), b = fighter('b-1', 20);
  const full = simulate(a, b, 5);
  assert.deepEqual(simulate(a, b, 5, {}), full);
  const hurt = simulate(a, b, 5, { a: 3 });
  const start = hurt.log[0];
  assert.ok(start.t === 'start' && start.a.hp === 3 && start.b.hp === b.hp);
  assert.equal(simulate(a, b, 5, { a: 9999 }).log[0].t === 'start' && (simulate(a, b, 5, { a: 9999 }).log[0] as { a: { hp: number } }).a.hp, a.hp);   // capped at the full HP
});

test('team: the battle card leads, extras must be dry, owned and unique, and at most two', () => {
  const s = withCards('a-1', 'a-2', 'a-3', 'a-4');
  assert.deepEqual(teamKeys(s), []);                                       // no battle card yet
  setFighter(s, 'a-1');
  assert.deepEqual(teamKeys(s), ['a-1']);
  assert.equal(addToTeam(s, 'a-1'), false);                                // the lead is already fighting
  assert.equal(addToTeam(s, 'zz'), false);
  assert.equal(addToTeam(s, 'a-2'), true);
  assert.equal(addToTeam(s, 'a-2'), false);
  assert.equal(addToTeam(s, 'a-3'), true);
  assert.equal(addToTeam(s, 'a-4'), false, 'the team is full');
  assert.deepEqual(teamKeys(s), ['a-1', 'a-2', 'a-3']);
  assert.equal(TEAM_EXTRAS, 2);
  s.collection['a-2'].soaked = true;                                       // a wet card drops out without leaving a hole
  assert.deepEqual(teamKeys(s), ['a-1', 'a-3']);
  assert.equal(canJoinTeam(s, 'a-2'), false);
  assert.equal(removeFromTeam(s, 'a-2'), true);
  assert.equal(removeFromTeam(s, 'a-2'), false);
  s.collection['a-1'].grading = { since: 0, cost: 1 };
  assert.deepEqual(teamKeys(s), []);                                       // the lead cannot fight
});

test('simulateTeam: the winner carries its HP over, the loser is replaced, and the same seed gives the same fight', () => {
  const strong = [fighter('s-1', 50), fighter('s-2', 50), fighter('s-3', 50)];
  const weak = [fighter('w-1', 1), fighter('w-2', 1), fighter('w-3', 1)];
  const r = simulateTeam(strong, weak, 3);
  assert.equal(r.winner, 'a');
  assert.ok(r.aliveA >= 1 && r.aliveB === 0);
  assert.deepEqual([r.duels[0].a, r.duels[0].b], [0, 0]);
  assert.deepEqual(r.duels[0].startHp, { a: strong[0].hp, b: weak[0].hp });
  for (let i = 1; i < r.duels.length; i++) {
    const prev = r.duels[i - 1], cur = r.duels[i];
    if (prev.result.winner === 'a') {                                      // the winner stays, hurt as it was, and a fresh rival comes in
      assert.equal(cur.a, prev.a); assert.equal(cur.b, prev.b + 1);
      assert.equal(cur.startHp.a, prev.result.hpLeft.a); assert.equal(cur.startHp.b, weak[cur.b].hp);
    } else {
      assert.equal(cur.b, prev.b); assert.equal(cur.a, prev.a + 1);
      assert.equal(cur.startHp.b, prev.result.hpLeft.b); assert.equal(cur.startHp.a, strong[cur.a].hp);
    }
  }
  assert.deepEqual(simulateTeam(strong, weak, 3), r);
  assert.equal(simulateTeam(weak, strong, 3).winner, 'b');
});

test('simulateTeam: a team always ends with one side out of cards, and odds follow the strength', () => {
  const even = [fighter('e-1', 20), fighter('e-2', 20), fighter('e-3', 20)];
  const other = [fighter('o-1', 20), fighter('o-2', 20), fighter('o-3', 20)];
  for (let seed = 1; seed <= 30; seed++) {
    const r = simulateTeam(even, other, seed);
    assert.ok(r.aliveA === 0 || r.aliveB === 0);
    assert.equal(r.winner, r.aliveB === 0 ? 'a' : 'b');
    assert.ok(r.duels.length >= 3 && r.duels.length <= 5);
  }
  const strong = [fighter('s-1', 35), fighter('s-2', 35), fighter('s-3', 35)];
  assert.ok(estimateTeamWin(strong, other, 60) > 0.8);
  assert.ok(estimateTeamWin(other, strong, 60) < 0.2);
});

test('elite four: needs every badge, then each trainer unlocks the next; first win pays big, rematches a little and capped', () => {
  const s = newState(0);
  assert.equal(eliteUnlocked(s, 0), false);
  battleOf(s).badges.push(...LEADERS.map(l => l.id));
  assert.equal(eliteUnlocked(s, 0), true);
  assert.equal(eliteUnlocked(s, 1), false);

  const first = recordEliteBattle(s, ELITE[0], 'Pikachu', true, 4);
  assert.deepEqual([first.coins, first.boxes, first.firstWin], [ELITE[0].reward.coins, ELITE[0].reward.boxes, true]);
  assert.equal(s.coins, ELITE[0].reward.coins); assert.equal(s.boxes, ELITE[0].reward.boxes);
  assert.equal(eliteUnlocked(s, 1), true);
  assert.deepEqual(eliteBeaten(s), ['lorelei']);

  const lost = recordEliteBattle(s, ELITE[1], 'Pikachu', false, 3);
  assert.equal(lost.coins, 0);
  assert.equal(eliteUnlocked(s, 2), false, 'a defeat opens nothing');

  const before = s.coins;
  for (let i = 0; i < ELITE_REMATCH_DAILY; i++) { assert.equal(recordEliteBattle(s, ELITE[0], 'Pikachu', true, 3).coins, ELITE_REMATCH); }
  const capped = recordEliteBattle(s, ELITE[0], 'Pikachu', true, 3);
  assert.deepEqual([capped.coins, capped.capped], [0, true]);
  assert.equal(s.coins, before + ELITE_REMATCH * ELITE_REMATCH_DAILY);
  assert.ok(battleOf(s).history.length > 0 && battleOf(s).history[0].leader === 'elite:lorelei');
});

test('elite four: every trainer has three cards with unique ids, in the level range', () => {
  const ids = new Set<string>();
  for (const t of ELITE) {
    const cards = eliteCards(t);
    assert.equal(cards.length, 3);
    for (const c of cards) { assert.ok(!ids.has(c.id)); ids.add(c.id); assert.ok(c.level >= 1 && c.level <= 50); }
    assert.deepEqual(cards.map(c => c.level), [...cards.map(c => c.level)].sort((a, b) => a - b), 'weakest first');
  }
});
