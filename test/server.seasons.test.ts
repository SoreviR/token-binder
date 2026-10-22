// League seasons: a calendar month, a podium archived when it ends, a softer Elo and a clean record for the next one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XP_PER_LEVEL } from '../src/game/engine';
import { SEASON_PODIUM, seasonEnd, seasonOf, softElo } from '../server/lib/rules';
import { DAY, T0, World, world } from './helpers/leagueWorld';

const claim = (key: string, level = 5) => {
  const xp = (level - 1) * XP_PER_LEVEL;
  return { key, xp, quotaPct: 60, profile: { coins: 100, cards: 5, items: 0, xp, tokens: xp + 1e6 } };
};

async function twoPlayers(w: World) {
  const created = await w.call('tokA', 'POST', '/leagues', { name: 'Pallet Town' });
  const id = created.body.league.id as number, code = created.body.league.code as string;
  await w.call('tokB', 'POST', '/leagues/join', { code });
  await w.call('tokA', 'PUT', '/fighter', claim('base1-4', 8));
  await w.call('tokB', 'PUT', '/fighter', claim('base1-58', 8));
  return { id, code };
}

test('seasonOf, seasonEnd and softElo: months in UTC, and Elo pulled halfway back to 1000', () => {
  assert.equal(seasonOf(T0), '2026-10');
  assert.equal(seasonOf(Date.UTC(2026, 11, 31, 23, 59)), '2026-12');
  assert.equal(seasonEnd(T0), Date.UTC(2026, 10, 1));
  assert.equal(seasonEnd(Date.UTC(2026, 11, 15)), Date.UTC(2027, 0, 1));
  assert.deepEqual([1200, 1000, 800, 1001].map(softElo), [1100, 1000, 900, 1001]);
});

test('a new league starts in the current season, shows when it ends and has no podium yet', async () => {
  const w = await world();
  const { id } = await twoPlayers(w);
  const v = (await w.call('tokA', 'GET', `/leagues/${id}`)).body;
  assert.equal(v.season.id, '2026-10');
  assert.equal(v.season.endsAt, new Date(Date.UTC(2026, 10, 1)).toISOString());
  assert.equal(v.podium, null);
  assert.ok(v.members.every((m: { crowns: number }) => m.crowns === 0));
});

test('when the month changes the podium is archived, Elo is softened and the record starts clean, once', async () => {
  const w = await world();
  w.clock.t = Date.UTC(2026, 9, 25, 12);                                  // late October, so the sessions outlive the month change
  const { id } = await twoPlayers(w);
  const duel = await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 });
  assert.equal(duel.status, 200);
  const before = (await w.call('tokA', 'GET', `/leagues/${id}`)).body.members;
  const winner = before[0], loser = before[1];
  assert.ok(winner.elo > 1000 && loser.elo < 1000);

  w.clock.t = Date.UTC(2026, 10, 2);                                      // November
  const v = (await w.call('tokA', 'GET', `/leagues/${id}`)).body;
  assert.equal(v.season.id, '2026-11');
  assert.equal(v.podium.season, '2026-10');
  assert.equal(v.podium.entries.length, 2);
  assert.deepEqual(v.podium.entries.map((e: { login: string }) => e.login), [winner.login, loser.login]);
  assert.equal(v.podium.entries[0].elo, winner.elo);                      // the podium keeps the final figures
  const now = Object.fromEntries(v.members.map((m: { login: string; elo: number; wins: number; losses: number; crowns: number }) => [m.login, m]));
  assert.equal(now[winner.login].elo, softElo(winner.elo));
  assert.equal(now[loser.login].elo, softElo(loser.elo));
  assert.deepEqual([now[winner.login].wins, now[winner.login].losses], [0, 0]);
  assert.equal(now[winner.login].crowns, 1);
  assert.equal(now[loser.login].crowns, 0);

  const again = (await w.call('tokB', 'GET', `/leagues/${id}`)).body;     // a second look the same month changes nothing
  assert.equal(again.members.find((m: { login: string }) => m.login === winner.login).elo, softElo(winner.elo));
  assert.equal((await w.d.db.query('select 1 from league_seasons')).length, 2);
});

test('seasons: players who never fought or are flagged BUSTED do not make the podium, and the public page shows it too', async () => {
  const w = await world();
  w.clock.t = Date.UTC(2026, 9, 25, 12);
  const { id, code } = await twoPlayers(w);
  await w.call('tokC', 'POST', '/leagues/join', { code });
  await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 });
  await w.d.db.query('update players set busted = true where id = 1');     // the one who fought and won is flagged
  w.clock.t = Date.UTC(2026, 10, 3);
  const pub = (await w.call(undefined, 'GET', `/public/league?code=${code}`)).body;
  assert.equal(pub.season.id, '2026-11');
  assert.deepEqual(pub.podium.entries.map((e: { login: string }) => e.login), ['misty']);   // brock never fought, ash is BUSTED
  assert.ok(pub.members.every((m: Record<string, unknown>) => typeof m.crowns === 'number'));
});

test('seasons: an idle league archives only the last season it played, and old leagues adopt the current one', async () => {
  const w = await world();
  const { id } = await twoPlayers(w);
  await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 });
  w.clock.t = T0 + 90 * DAY;                                               // three months later
  w.forget();
  const v = (await w.call('tokA', 'GET', `/leagues/${id}`)).body;
  assert.equal(v.podium.season, '2026-10');
  assert.equal((await w.d.db.query<{ n: number }>('select count(distinct season)::int as n from league_seasons'))[0].n, 1);

  await w.d.db.query('update leagues set season = null where id = $1', [id]);   // a league from before seasons existed
  const old = (await w.call('tokA', 'GET', `/leagues/${id}`)).body;
  assert.equal(old.season.id, seasonOf(T0 + 90 * DAY));
  assert.equal((await w.d.db.query('select 1 from league_seasons')).length, v.podium.entries.length, 'nothing archived for it');
  assert.ok(SEASON_PODIUM >= 3);
});

test('seasons: leaving and rejoining after a new season restores the softened Elo, and deleting your data removes your trophies', async () => {
  const w = await world();
  w.clock.t = Date.UTC(2026, 9, 25, 12);
  const { id, code } = await twoPlayers(w);
  await w.call('tokA', 'POST', `/leagues/${id}/duel`, { rival: 2 });
  const top = (await w.call('tokA', 'GET', `/leagues/${id}`)).body.members[0];
  const topToken = top.login === 'ash' ? 'tokA' : 'tokB';
  await w.call(topToken, 'DELETE', `/leagues/${id}`);                      // leave in October with a high Elo
  w.clock.t = Date.UTC(2026, 10, 5);
  await w.call(topToken === 'tokA' ? 'tokB' : 'tokA', 'GET', `/leagues/${id}`);   // the season turns
  await w.call(topToken, 'POST', '/leagues/join', { code });
  const back = (await w.call(topToken, 'GET', `/leagues/${id}`)).body.members.find((m: { you: boolean }) => m.you);
  assert.equal(back.elo, softElo(top.elo));
  assert.equal(back.wins, 0);

  await w.call('tokA', 'DELETE', '/me');
  assert.equal((await w.d.db.query("select 1 from league_seasons where login = 'ash'")).length, 0);
});
