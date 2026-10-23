// The whole league flow against an in-memory Postgres: players, leagues, fighters, duels, the inbox, the web page data and deletion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATTLE_VERSION, simulate, makeFighter } from '../src/game/battle';
import { XP_PER_LEVEL } from '../src/game/engine';
import { parseCard } from '../src/game/cardData';
import { route } from '../server/lib/router';
import { DAILY_DUELS, DAILY_PER_RIVAL, MAX_MEMBERS } from '../server/lib/rules';

import { CARDS, DAY, GITHUB, T0, World, world } from './helpers/leagueWorld';

// An honest player's report by default: a save whose total XP covers the fighter's, with lifetime tokens to match.
const claim = (key: string, level = 5, extra: object = {}) => {
  const xp = (level - 1) * XP_PER_LEVEL;
  return { key, xp, quotaPct: 60, profile: { coins: 100, cards: 5, items: 0, xp, tokens: xp + 1e6 }, ...extra };
};

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

test('the daily limits belong to each league: attacks in one do not count in another', async () => {
  const w = await world();
  const one = await league(w);
  const two = (await w.call('tokA', 'POST', '/leagues', { name: 'Cerulean' })).body.league;
  for (const who of ['tokB', 'tokC']) { await w.call(who, 'POST', '/leagues/join', { code: two.code }); }
  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8));
  await w.call('tokB', 'PUT', '/fighter', claim('base1-58', 8));
  await w.call('tokC', 'PUT', '/fighter', claim('base1-58', 8));
  for (let i = 0; i < DAILY_PER_RIVAL; i++) { assert.equal((await w.call('tokA', 'POST', `/leagues/${one.id}/duel`, { rival: 2 })).status, 200); }
  assert.equal((await w.call('tokA', 'POST', `/leagues/${one.id}/duel`, { rival: 2 })).body.error, 'rival-limit');
  const board = async (id: number) => (await w.call('tokA', 'GET', `/leagues/${id}`)).body;
  assert.equal((await board(one.id)).members.find((m: any) => m.id === 2).left, 0);
  assert.equal((await board(two.id)).members.find((m: any) => m.id === 2).left, DAILY_PER_RIVAL, 'the other league starts fresh');
  assert.equal((await board(two.id)).today.used, 0, 'and so does the daily total');
  assert.equal((await w.call('tokA', 'POST', `/leagues/${two.id}/duel`, { rival: 2 })).status, 200);
  assert.equal((await board(one.id)).today.used, DAILY_PER_RIVAL);
  assert.equal((await board(two.id)).today.used, 1);
});

test('the board says how many challenges are left against each rival today, and when the limits reset', async () => {
  const w = await world();
  const { id, code } = await league(w);
  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8));
  await w.call('tokB', 'PUT', '/fighter', claim('base1-58', 8));
  await w.call('tokC', 'PUT', '/fighter', claim('base1-58', 8));
  const view = async () => (await w.call('tokA', 'GET', `/leagues/${id}`)).body;
  const left = (b: any) => Object.fromEntries(b.members.filter((m: any) => !m.you).map((m: any) => [m.id, m.left]));
  let b = await view();
  assert.deepEqual(left(b), { 2: DAILY_PER_RIVAL, 3: DAILY_PER_RIVAL });
  assert.equal(b.members.find((m: any) => m.you).left, undefined, 'nothing about yourself');
  assert.equal(b.today.perRival, DAILY_PER_RIVAL);
  assert.equal(new Date(b.today.resetsAt).getTime(), Math.floor(T0 / DAY) * DAY + DAY, 'the next midnight UTC');

  await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 });
  assert.deepEqual(left(await view()), { 2: DAILY_PER_RIVAL - 1, 3: DAILY_PER_RIVAL });
  await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 });
  assert.deepEqual(left(await view()), { 2: 0, 3: DAILY_PER_RIVAL });
  assert.equal((await w.call('tokB', 'GET', `/leagues/${id}`)).body.members.find((m: any) => m.id === 1).left, DAILY_PER_RIVAL, 'each player has their own count');

  assert.ok(!JSON.stringify((await w.call(undefined, 'GET', `/public/league?code=${code.toLowerCase()}`)).body).includes('"left"'), 'the public page has none');
  w.clock.t += DAY;
  assert.deepEqual(left(await view()), { 2: DAILY_PER_RIVAL, 3: DAILY_PER_RIVAL }, 'a new day starts over');
});

test('the daily total stops a player at 10 challenges', async () => {
  const w = await world();
  const { id } = await league(w);
  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8));
  await w.call('tokB', 'PUT', '/fighter', claim('base1-58', 8));
  await w.call('tokC', 'PUT', '/fighter', claim('base1-58', 8));
  // Pretend the day's total is already spent: the limit now reads the counter, not the duels table.
  const day = new Date(Math.floor(w.clock.t / DAY) * DAY).toISOString().slice(0, 10);
  await w.d.db.query('insert into league_duel_quota (league_id, challenger, defender, day, n) values ($1, 1, 0, $2, $3)', [id, day, DAILY_DUELS]);
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

const godSave = { profile: { coins: 9e8, cards: 3000, xp: 2e9, tokens: 5e6 } };
const bustedList = async (w: World, who: string, id: number) =>
  ((await w.call(who, 'GET', `/leagues/${id}`)).body.members as any[]).filter(m => m.busted).map(m => m.login);

test('an impossible save report flags the player BUSTED, drops them to the bottom, and a majority pardon lifts it in that league', async () => {
  const w = await world();
  const { id } = await league(w);   // tokA (owner), tokB, tokC
  await w.call('tokB', 'PUT', '/fighter', claim('base1-58', 5));
  await w.call('tokC', 'PUT', '/fighter', claim('base1-58', 5));
  const r = await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8, godSave));
  assert.equal(r.status, 200);
  assert.equal(r.body.busted, true);

  const board = await w.call('tokB', 'GET', `/leagues/${id}`);
  assert.equal(board.body.members.at(-1).login, 'ash', 'the cheater is sorted last');
  assert.equal(board.body.members.at(-1).busted, true);
  assert.equal(board.body.pardonNeed, 2, 'a majority of the other two members');

  const first = await w.call('tokB', 'POST', `/leagues/${id}/pardon`, { subject: 1 });
  assert.deepEqual([first.body.pardoned, first.body.votes], [false, 1]);
  const second = await w.call('tokC', 'POST', `/leagues/${id}/pardon`, { subject: 1 });
  assert.equal(second.body.pardoned, true);
  assert.deepEqual(await bustedList(w, 'tokB', id), []);
});

test('a pardon only counts in the league that gave it (an alt cannot clean you everywhere)', async () => {
  const w = await world();
  const { id } = await league(w);                                    // league 1: tokA, tokB, tokC
  const other = (await w.call('tokB', 'POST', '/leagues', { name: 'Viridian' })).body.league;
  await w.call('tokA', 'POST', '/leagues/join', { code: other.code });   // league 2: tokB, tokA
  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8, godSave));
  await w.call('tokB', 'POST', `/leagues/${id}/pardon`, { subject: 1 });
  await w.call('tokC', 'POST', `/leagues/${id}/pardon`, { subject: 1 });
  assert.deepEqual(await bustedList(w, 'tokB', id), [], 'cleared where the members vouched for them');
  assert.deepEqual(await bustedList(w, 'tokB', other.id), ['ash'], 'still BUSTED in the other league');
});

test('pardon votes from someone who has left the league do not count', async () => {
  const w = await world();
  const { id } = await league(w);
  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8, godSave));
  await w.call('tokB', 'POST', `/leagues/${id}/pardon`, { subject: 1 });
  const tally = async () => (await w.call('tokC', 'GET', `/leagues/${id}`)).body.members.find((m: any) => m.login === 'ash').bustVotes;
  assert.equal(await tally(), 1);
  await w.call('tokB', 'DELETE', `/leagues/${id}`);
  assert.equal(await tally(), 0, 'tokB left, so the vote went with them');
});

test('a BUSTED player cannot challenge, and cannot be challenged, in a league that has not pardoned them', async () => {
  const w = await world();
  const { id } = await league(w);
  await w.call('tokB', 'PUT', '/fighter', claim('base1-58', 5));
  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8, godSave));
  assert.equal((await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 })).body.error, 'busted');
  assert.equal((await w.call('tokB', 'POST', `/leagues/${id}/duel`, { rival: 1 })).body.error, 'rival-busted');
});

test('an honest veteran with a long history is not BUSTED, neither on the first report nor after being reborn', async () => {
  const w = await world();
  await league(w);
  const veteran = { profile: { coins: 300, cards: 40, items: 5, xp: 3e6, tokens: 200e6 } };
  assert.equal((await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 5, veteran))).body.busted, false);
  assert.equal((await w.call('tokA', 'POST', '/me/reborn')).status, 200);
  assert.equal((await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 1, { profile: { coins: 0, cards: 1, items: 0, xp: 0, tokens: 200e6 } }))).body.busted, false);
});

test('being reborn clears BUSTED, but a save that was not really reset is flagged again at once', async () => {
  const w = await world();
  const { id } = await league(w);
  assert.equal((await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8, godSave))).body.busted, true);
  assert.equal((await w.call('tokA', 'POST', '/me/reborn')).status, 200);
  assert.deepEqual(await bustedList(w, 'tokB', id), []);
  // a genuine reset (near-zero) stays clean
  assert.equal((await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 2, { profile: { coins: 0, cards: 1, items: 0, xp: XP_PER_LEVEL, tokens: 0 } }))).body.busted, false);
  // growing the save beyond what the time allows trips it again (the new baseline is the reset one)
  assert.equal((await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8, godSave))).body.busted, true);
  // and so does a reborn that did not wipe anything
  assert.equal((await w.call('tokA', 'POST', '/me/reborn')).status, 200);
  assert.equal((await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8, godSave))).body.busted, true);
});

test('a slow edit is caught too: each report is measured from the last accepted one', async () => {
  const w = await world();
  await league(w);
  const at = (coins: number) => claim('base1-4', 5, { profile: { coins, cards: 5, items: 0, xp: 1.6e6, tokens: 2.6e6 } });
  assert.equal((await w.call('tokA', 'PUT', '/fighter', at(100))).body.busted, false);
  w.clock.t += 20 * DAY;
  assert.equal((await w.call('tokA', 'PUT', '/fighter', at(500_000))).body.busted, false, 'honest growth over 20 days');
  w.clock.t += 60_000;
  assert.equal((await w.call('tokA', 'PUT', '/fighter', at(9e8))).body.busted, true, 'then a jump a minute later');
});

test('a report with less than before never busts; a fighter with no profile is refused; a fighter bigger than the save is BUSTED', async () => {
  const w = await world();
  const { id } = await league(w);
  assert.equal((await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 5, { profile: { coins: 400, cards: 20, items: 0, xp: 3e6, tokens: 4e6 } }))).body.busted, false);
  assert.equal((await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 5, { profile: { coins: 0, cards: 1, items: 0, xp: 3e6, tokens: 4e6 } }))).body.busted, false);
  const none = await w.call('tokA', 'PUT', '/fighter', { key: 'base1-4', xp: 3 * XP_PER_LEVEL, quotaPct: 60 });
  assert.deepEqual([none.status, none.body.error], [426, 'update-required'], 'an old client that sends no profile');
  assert.deepEqual(await bustedList(w, 'tokA', id), []);
  // a fighter with 20M XP out of a save that totals 1M cannot be real
  assert.equal((await w.call('tokB', 'PUT', '/fighter', claim('base1-58', 50, { profile: { coins: 0, cards: 1, items: 0, xp: 1e6, tokens: 30e6 } }))).body.busted, true);
});

/* ───── team leagues ───── */

/** A fighter with two cards backing it up (variants of the same card are different album cards), and a save whose XP covers all three. */
const teamClaim = (lead: string, level: number, mates: [string, number][]) => {
  const xp = (l: number) => (l - 1) * XP_PER_LEVEL;
  const team = mates.map(([key, l]) => ({ key, xp: xp(l) }));
  const total = xp(level) + team.reduce((n, m) => n + m.xp, 0);
  return { key: lead, xp: xp(level), quotaPct: 60, team, profile: { coins: 100, cards: 5, items: 0, xp: total, tokens: total + 1e6 } };
};
const charizards = teamClaim('base1-4', 8, [['base1-4#shadowless', 8], ['base1-4#first', 8]]);
const pikachus = teamClaim('base1-58', 3, [['base1-58#shadowless', 3], ['base1-58#first', 3]]);

async function teamLeague(w: World) {
  const created = await w.call('tokA', 'POST', '/leagues', { name: 'Team Rocket HQ', mode: 'team' });
  assert.equal(created.status, 200);
  assert.equal(created.body.league.mode, 'team');
  for (const who of ['tokB', 'tokC']) { assert.equal((await w.call(who, 'POST', '/leagues/join', { code: created.body.league.code })).body.league.mode, 'team'); }
  return { id: created.body.league.id as number, code: created.body.league.code as string };
}

test('team leagues: the mode is chosen when creating and shown everywhere; anything else makes a single-card league', async () => {
  const w = await world();
  const { id } = await teamLeague(w);
  assert.equal((await w.call('tokA', 'GET', '/leagues')).body.leagues.find((l: any) => l.id === id).mode, 'team');
  assert.equal((await w.call('tokA', 'GET', `/leagues/${id}`)).body.league.mode, 'team');
  assert.equal((await w.call('tokB', 'POST', '/leagues', { name: 'Plain' })).body.league.mode, 'single');
  assert.equal((await w.call('tokC', 'POST', '/leagues', { name: 'Odd', mode: 'chaos' })).body.league.mode, 'single');
});

test('the team is registered with the fighter and shown on the board, validated and clamped like the fighter', async () => {
  const w = await world();
  const { id } = await teamLeague(w);
  const r = await w.call('tokA', 'PUT', '/fighter', charizards);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.team.map((m: any) => [m.key, m.name, m.level]), [['base1-4#shadowless', 'Charizard', 8], ['base1-4#first', 'Charizard', 8]]);
  assert.equal(r.body.busted, false);
  const me = (await w.call('tokB', 'GET', `/leagues/${id}`)).body.members.find((m: any) => m.login === 'ash');
  assert.equal(me.team.length, 2);
  assert.equal(me.team[1].name, 'Charizard');

  const bad = (team: unknown) => w.call('tokA', 'PUT', '/fighter', { ...charizards, team });
  assert.equal((await bad([{ key: 'base1-58', xp: 0 }, { key: 'base1-58', xp: 0 }])).body.error, 'invalid-team', 'no repeats');
  assert.equal((await bad([{ key: 'base1-4', xp: 0 }])).body.error, 'invalid-team', 'not the fighter itself');
  assert.equal((await bad([{ key: 'base1-58', xp: 0 }, { key: 'base1-58#first', xp: 0 }, { key: 'base1-58#shadowless', xp: 0 }])).body.error, 'invalid-team', 'at most two');
  assert.equal((await bad([{ key: '../etc', xp: 0 }])).body.error, 'invalid-team');
  // A level-50 card on day one is clamped to the cap, like the fighter.
  const big = await w.call('tokC', 'PUT', '/fighter', teamClaim('base1-58', 3, [['base1-4', 50], ['base1-4#first', 3]]));
  assert.equal(big.body.clamped, true);
  assert.equal(big.body.team[0].level, 10);
});

test('a team made of XP the save does not have is BUSTED, like a made-up fighter', async () => {
  const w = await world();
  await teamLeague(w);
  // The save only covers the fighter's XP, not the two cards backing it up.
  const r = await w.call('tokA', 'PUT', '/fighter', { ...charizards, profile: { coins: 100, cards: 5, items: 0, xp: 7 * XP_PER_LEVEL, tokens: 8e6 } });
  assert.equal(r.body.busted, true);
});

test('a team duel: a series of 1v1 fights where the winner keeps its HP and the loser is replaced; Elo for the team result', async () => {
  const w = await world();
  const { id } = await teamLeague(w);
  await w.call('tokA', 'PUT', '/fighter', charizards);
  await w.call('tokB', 'PUT', '/fighter', pikachus);
  const r = await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 });
  assert.equal(r.status, 200);
  const t = r.body.team;
  assert.ok(t, 'the response carries the whole team fight');
  assert.equal(t.me.length, 3);
  assert.equal(t.foe.length, 3);
  assert.ok(t.duels.length >= 3 && t.duels.length <= 5, 'between 3 and 5 fights for two teams of three');
  assert.equal(r.body.winner, t.duels.at(-1).winner, 'the last fight decides the duel');
  assert.equal(r.body.rounds, t.duels.reduce((n: number, x: any) => n + x.rounds, 0));
  assert.equal(r.body.winner === 'a' ? t.aliveB : t.aliveA, 0, 'the loser has no card left');
  assert.deepEqual(t.duels[0].startHp, { a: t.me[0].hp, b: t.foe[0].hp }, 'both start at full HP');
  for (let i = 1; i < t.duels.length; i++) {
    const prev = t.duels[i - 1], cur = t.duels[i];
    const [keep, fresh] = prev.winner === 'a' ? ['a', 'b'] : ['b', 'a'];
    assert.equal(cur[keep], prev[keep], 'the winner stays in');
    assert.equal(cur[fresh], prev[fresh] + 1, 'the loser is replaced by the next card');
    const side = (s: string) => (s === 'a' ? t.me : t.foe);
    assert.equal(cur.startHp[fresh], side(fresh)[cur[fresh]].hp, 'the newcomer comes in at full HP');
    assert.ok(cur.startHp[keep] > 0 && cur.startHp[keep] <= side(keep)[cur[keep]].hp, 'the winner keeps what it had left');
  }
  const board = (await w.call('tokA', 'GET', `/leagues/${id}`)).body.members;
  const a = board.find((m: any) => m.login === 'ash'), b = board.find((m: any) => m.login === 'misty');
  assert.equal(a.elo + b.elo, 2000, 'what one gains the other loses');
  assert.equal(a.wins + a.losses, 1, 'a team duel is one result, not one per fight');
  const row = (await w.d.db.query<any>('select team, log from duels'))[0];
  assert.equal(row.team, true);
  assert.equal(row.log.length, t.duels.length);
});

test('a team league needs a full team on both sides, checked before a duel of the daily limit is spent', async () => {
  const w = await world();
  const { id } = await teamLeague(w);
  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8));     // a fighter with no team
  await w.call('tokB', 'PUT', '/fighter', pikachus);
  assert.equal((await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 })).body.error, 'no-team');
  await w.call('tokA', 'PUT', '/fighter', charizards);
  await w.call('tokC', 'PUT', '/fighter', teamClaim('base1-58', 3, [['base1-58#first', 3]]));   // only one card backing it up
  assert.equal((await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 3 })).body.error, 'rival-no-team');
  assert.equal((await w.d.db.query('select 1 from league_duel_quota')).length, 0, 'no slot of the daily limit was spent');
});

test('the defender sees a team duel once in the inbox, from their own side', async () => {
  const w = await world();
  const { id } = await teamLeague(w);
  await w.call('tokA', 'PUT', '/fighter', charizards);
  await w.call('tokB', 'PUT', '/fighter', pikachus);
  const r = await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 });
  const box = (await w.call('tokB', 'GET', '/inbox')).body.duels;
  assert.equal(box.length, 1);
  const d = box[0], t = d.team;
  assert.equal(d.won, r.body.winner === 'b');
  assert.equal(t.me[0].name, 'Pikachu', 'the defender is side a now');
  assert.equal(t.foe[0].name, 'Charizard');
  assert.deepEqual([t.aliveA, t.aliveB], [r.body.team.aliveB, r.body.team.aliveA]);
  t.duels.forEach((x: any, i: number) => {
    const o = r.body.team.duels[i];
    assert.deepEqual([x.a, x.b, x.winner], [o.b, o.a, o.winner === 'a' ? 'b' : 'a']);
    assert.equal(x.log.at(-1).winner, x.winner, 'each fight log is mirrored too');
  });
  assert.equal((await w.call('tokB', 'GET', '/inbox')).body.duels.length, 0, 'delivered only once');
});

test('in a single-card league the team is ignored: one card against one card, as before', async () => {
  const w = await world();
  const { id } = await league(w);
  await w.call('tokA', 'PUT', '/fighter', charizards);
  await w.call('tokB', 'PUT', '/fighter', pikachus);
  const r = await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 });
  assert.equal(r.status, 200);
  assert.equal(r.body.team, undefined);
  assert.ok(r.body.log.length > 0);
  assert.equal((await w.d.db.query<any>('select team from duels'))[0].team, false);
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
