// The whole league flow against an in-memory Postgres: players, leagues, fighters, duels, the inbox, the web page data and deletion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATTLE_VERSION, simulate, makeFighter } from '../src/game/battle';
import { XP_PER_LEVEL } from '../src/game/engine';
import { parseCard } from '../src/game/cardData';
import { route } from '../server/lib/router';
import { DAILY_DUELS, DAILY_PER_RIVAL, MAX_MEMBERS } from '../server/lib/rules';

import { CARDS, DAY, GITHUB, T0, World, world } from './helpers/leagueWorld';

const claim = (key: string, level = 5, extra: object = {}) => ({ key, xp: (level - 1) * XP_PER_LEVEL, quotaPct: 60, ...extra });

async function league(w: World) {
  const created = await w.call('tokA', 'POST', '/leagues', { name: 'Pallet Town' });
  assert.equal(created.status, 200);
  const code = created.body.league.code as string;
  for (const who of ['tokB', 'tokC']) { assert.equal((await w.call(who, 'POST', '/leagues/join', { code: code.toLowerCase() })).status, 200); }
  return { id: created.body.league.id as number, code };
}

test('login needs consent and a GitHub token GitHub accepts; every other route needs a session', async () => {
  const w = await world();
  assert.equal((await route(w.d, { method: 'POST', path: '/auth', query: {}, body: { githubToken: 'tokA' }, headers: {} })).body.error, 'consent-required');
  assert.equal((await route(w.d, { method: 'POST', path: '/auth', query: {}, body: { githubToken: 'nope', consent: true }, headers: {} })).status, 401);
  assert.equal((await w.call(undefined, 'GET', '/leagues')).status, 401);
  assert.equal((await w.call(undefined, 'GET', '/health')).status, 200);
  const ok = await route(w.d, { method: 'POST', path: '/auth', query: {}, body: { githubToken: 'tokA', consent: true }, headers: {} });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.login, 'ash');
  assert.ok(!JSON.stringify(ok.body).includes('tokA'), 'the GitHub token is never sent back');
  const stored = await w.d.db.query('select * from players');
  assert.ok(!JSON.stringify(stored).includes('tokA'), 'nor stored');
});

test('a client with other battle rules is asked to update before it can do anything', async () => {
  const w = await world();
  const r = await w.call('tokA', 'GET', '/leagues', undefined, { 'x-battle-version': String(BATTLE_VERSION + 1) });
  assert.equal(r.status, 426);
  assert.equal(r.body.error, 'update-required');
  assert.equal(r.body.battleVersion, BATTLE_VERSION);
  assert.equal((await w.call('tokA', 'GET', '/leagues', undefined, { 'x-battle-version': '' })).status, 426);
});

test('leagues: create, join by code in any case, list, leave, ownership passes on, and the league ends when empty', async () => {
  const w = await world();
  const { id, code } = await league(w);
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await w.call('tokB', 'POST', '/leagues/join', { code: 'ZZZZ-ZZZZ' })).body.error, 'unknown-code');
  assert.equal((await w.call('tokB', 'POST', '/leagues/join', { code: 'x' })).body.error, 'invalid-code');
  assert.equal((await w.call('tokB', 'POST', '/leagues/join', { code })).status, 200, 'joining twice is harmless');
  assert.equal((await w.call('tokB', 'GET', '/leagues')).body.leagues[0].members, 3);

  assert.equal((await w.call('tokA', 'DELETE', `/leagues/${id}`)).status, 200);   // the owner leaves
  const owner = await w.d.db.query<{ owner: number }>('select owner from leagues where id = $1', [id]);
  assert.equal(Number(owner[0].owner), 2, 'the oldest member takes over');
  assert.equal((await w.call('tokA', 'GET', `/leagues/${id}`)).body.error, 'not-member');
  await w.call('tokB', 'DELETE', `/leagues/${id}`);
  await w.call('tokC', 'DELETE', `/leagues/${id}`);
  assert.equal((await w.d.db.query('select 1 from leagues')).length, 0);
});

test('a league holds a limited number of members, and a player a limited number of leagues', async () => {
  const w = await world();
  const { id, code } = await league(w);
  for (let i = 10; i < 10 + MAX_MEMBERS - 3; i++) {
    await w.d.db.query('insert into players (id, login) values ($1, $2)', [i, 'p' + i]);
    await w.d.db.query('insert into members (league_id, player_id) values ($1, $2)', [id, i]);
  }
  GITHUB.tokZ = { id: 99, login: 'late' };
  assert.equal((await w.call('tokZ', 'POST', '/leagues/join', { code })).body.error, 'league-full');
  for (let i = 0; i < 2; i++) { assert.equal((await w.call('tokZ', 'POST', '/leagues', { name: 'L' + i })).status, 200); }
  assert.equal((await w.call('tokZ', 'POST', '/leagues', { name: 'L2' })).status, 200);
  assert.equal((await w.call('tokZ', 'POST', '/leagues', { name: 'L3' })).body.error, 'too-many-owned');
  delete GITHUB.tokZ;
});

test('registering a fighter: the card must exist and an inflated level is clamped to what a new player may field', async () => {
  const w = await world();
  const bad = await w.call('tokA', 'PUT', '/fighter', claim('nope-1'));
  assert.equal(bad.body.error, 'card-unavailable');
  assert.equal((await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 5, { grade: 11 }))).body.error, 'invalid-grade');

  const ok = await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 5, { grade: 9, held: 'sturdy-plate' }));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.fighter.name, 'Charizard');
  assert.equal(ok.body.fighter.level, 5);
  assert.equal(ok.body.clamped, false);

  const cheat = await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 50));
  assert.equal(cheat.body.clamped, true);
  assert.equal(cheat.body.fighter.level, 10);
  w.clock.t += 20 * DAY;
  const later = await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 50));
  assert.equal(later.body.fighter.level, 50, 'the cap rose with the days');
});

test('a duel: the server simulates it with its own seed, moves Elo for both, and the same data replays the same fight', async () => {
  const w = await world();
  const { id } = await league(w);
  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8, { quotaPct: 100 }));
  await w.call('tokB', 'PUT', '/fighter', claim('base1-58', 8, { quotaPct: 20 }));

  assert.equal((await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 3 })).body.error, 'rival-no-fighter');
  assert.equal((await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 1 })).body.error, 'invalid-rival');
  assert.equal((await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 77 })).body.error, 'rival-not-member');

  const r = await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 });
  assert.equal(r.status, 200);
  assert.equal(r.body.rival, 'misty');
  assert.equal(r.body.battleVersion, BATTLE_VERSION);
  assert.equal(r.body.log[0].t, 'start');
  assert.equal(r.body.log.at(-1).t, 'end');
  assert.equal(r.body.me.name, 'Charizard');
  assert.equal(r.body.foe.name, 'Pikachu');

  const board = (await w.call('tokA', 'GET', `/leagues/${id}`)).body;
  const a = board.members.find((m: any) => m.login === 'ash'), b = board.members.find((m: any) => m.login === 'misty');
  assert.equal(a.elo + b.elo, 2000, 'what one gains the other loses');
  assert.equal(a.elo, r.body.elo);
  assert.equal(a.wins + a.losses, 1);
  assert.equal(board.today.used, 1);
  assert.equal(board.duels.length, 1);
  assert.equal(board.duels[0].you, 'challenger');

  // The player who used less of their quota (misty, 20% vs 100%) gets +6%. The stored seed and the stored fighters replay the exact same fight (nothing is hidden from the players).
  const row = (await w.d.db.query<any>('select seed, a, b, log from duels'))[0];
  const cardA = parseCard(CARDS['base1-4'])!; cardA.era = 'vintage';
  const cardB = parseCard(CARDS['base1-58'])!; cardB.era = 'vintage';
  const replay = simulate(makeFighter('x', cardA, 7 * XP_PER_LEVEL, {}), makeFighter('y', cardB, 7 * XP_PER_LEVEL, { tokensBonus: 0.06 }), Number(row.seed));
  assert.equal(replay.winner, r.body.winner, 'the same inputs give the same winner');
  assert.deepEqual(replay.log, row.log);
});

test('the rival sees the duel once in the inbox, from their own side', async () => {
  const w = await world();
  const { id } = await league(w);
  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8));
  await w.call('tokB', 'PUT', '/fighter', claim('base1-58', 8));
  const r = await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 });
  const box = await w.call('tokB', 'GET', '/inbox');
  assert.equal(box.body.duels.length, 1);
  const duel = box.body.duels[0];
  assert.equal(duel.challenger, 'ash');
  assert.equal(duel.won, r.body.winner === 'b');
  assert.equal(duel.me.name, 'Pikachu');
  assert.equal(duel.eloChange, -r.body.eloChange);
  assert.equal(duel.log.at(-1).winner, duel.won ? 'a' : 'b', 'the log is mirrored: the defender is always side a');
  assert.equal(duel.log[0].a.name, 'Pikachu');
  assert.equal((await w.call('tokB', 'GET', '/inbox')).body.duels.length, 0, 'it is delivered only once');
  assert.equal((await w.call('tokA', 'GET', '/inbox')).body.duels.length, 0, 'the challenger got it as the response');
});

test('daily limits: two duels per rival per day, and a new day resets them', async () => {
  const w = await world();
  const { id } = await league(w);
  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8));
  await w.call('tokB', 'PUT', '/fighter', claim('base1-58', 8));
  await w.call('tokC', 'PUT', '/fighter', claim('base1-58', 8));
  for (let i = 0; i < DAILY_PER_RIVAL; i++) { assert.equal((await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 })).status, 200); }
  const third = await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 });
  assert.equal(third.status, 429);
  assert.equal(third.body.error, 'rival-limit');
  assert.equal((await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 3 })).status, 200, 'another rival is fine');
  w.clock.t += DAY;
  assert.equal((await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 })).status, 200);
});

test('the daily total stops a player at 10 challenges', async () => {
  const w = await world();
  const { id } = await league(w);
  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8));
  await w.call('tokB', 'PUT', '/fighter', claim('base1-58', 8));
  await w.call('tokC', 'PUT', '/fighter', claim('base1-58', 8));
  // Pretend the day's total is already spent: the limit now reads the counter, not the duels table.
  const day = new Date(Math.floor(w.clock.t / DAY) * DAY).toISOString().slice(0, 10);
  await w.d.db.query('insert into duel_quota (challenger, defender, day, n) values (1, 0, $1, $2)', [day, DAILY_DUELS]);
  const last = await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 3 });
  assert.equal(last.status, 429);
  assert.equal(last.body.error, 'daily-limit');
});

test('the per-rival limit holds even when the duels are fired all at once (the old count-then-insert race is gone)', async () => {
  const w = await world();
  const { id } = await league(w);
  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8));
  await w.call('tokB', 'PUT', '/fighter', claim('base1-58', 8));
  const burst = await Promise.all(Array.from({ length: 12 }, () => w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 })));
  const ok = burst.filter(r => r.status === 200).length;
  assert.equal(ok, DAILY_PER_RIVAL, `only ${DAILY_PER_RIVAL} should go through, not ${ok}`);
  assert.ok(burst.some(r => r.status === 429 && r.body.error === 'rival-limit'));
  const saved = Number((await w.d.db.query<{ n: number }>('select count(*)::int as n from duels where challenger = 1'))[0].n);
  assert.equal(saved, DAILY_PER_RIVAL, 'and no extra duels were saved');
});

test('leaving a league and rejoining keeps your Elo and record (you cannot wipe losses by leaving)', async () => {
  const w = await world();
  const { id, code } = await league(w);
  await w.call('tokA', 'PUT', '/fighter', claim('base1-58', 1));   // weak
  await w.call('tokB', 'PUT', '/fighter', claim('base1-4', 8));    // strong, so tokA's Elo moves
  await w.call('tokB', 'POST', `/leagues/${id}/duel`, { rival: 1 });
  await w.call('tokB', 'POST', `/leagues/${id}/duel`, { rival: 1 });
  const me = async () => (await w.call('tokA', 'GET', `/leagues/${id}`)).body.members.find((m: any) => m.you);
  const before = await me();
  assert.equal(before.wins + before.losses, 2);
  assert.notEqual(before.elo, 1000, 'two duels have moved the Elo away from the start');

  assert.equal((await w.call('tokA', 'DELETE', `/leagues/${id}`)).status, 200);   // leave
  assert.equal((await w.call('tokA', 'POST', '/leagues/join', { code })).status, 200);   // rejoin
  const after = await me();
  assert.equal(after.elo, before.elo, 'Elo is restored, not reset to 1000');
  assert.equal(after.wins, before.wins);
  assert.equal(after.losses, before.losses);
});

test('the public ranking page: reachable with the invite code, with logins and results only', async () => {
  const w = await world();
  const { id, code } = await league(w);
  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8));
  await w.call('tokB', 'PUT', '/fighter', claim('base1-58', 8));
  await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 });
  const page = await w.call(undefined, 'GET', `/public/league?code=${code.toLowerCase()}`);
  assert.equal(page.status, 200);
  assert.equal(page.body.name, 'Pallet Town');
  assert.equal(page.body.members.length, 3);
  assert.equal(page.body.duels.length, 1);
  assert.ok(page.body.members[0].elo >= page.body.members[1].elo, 'sorted by Elo');
  assert.ok(!('id' in page.body.members[0]) && !('you' in page.body.members[0]), 'no ids');
  assert.ok(!JSON.stringify(page.body).includes('"log"'), 'no fight logs');
  assert.equal((await w.call(undefined, 'GET', '/public/league?code=AAAA-AAAA')).status, 404);
});

test('deleting my data removes me everywhere, ownership of my leagues passes on, and my session stops working', async () => {
  const w = await world();
  const { id } = await league(w);
  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8));
  await w.call('tokB', 'PUT', '/fighter', claim('base1-58', 8));
  await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 });
  assert.equal((await w.call('tokA', 'DELETE', '/me')).status, 200);

  for (const table of ['players', 'members', 'fighters', 'duels']) {
    const rows = await w.d.db.query<any>(`select * from ${table} ${table === 'players' ? 'where id = 1' : table === 'duels' ? 'where challenger = 1 or defender = 1' : 'where player_id = 1'}`);
    assert.equal(rows.length, 0, table);
  }
  assert.equal((await w.call('tokA', 'GET', '/leagues')).body.error, 'unknown-player');
  const l = await w.d.db.query<{ owner: number }>('select owner from leagues where id = $1', [id]);
  assert.equal(Number(l[0].owner), 2, 'the league lives on under another owner');
  assert.equal((await w.call('tokB', 'GET', `/leagues/${id}`)).body.members.length, 2);
});
