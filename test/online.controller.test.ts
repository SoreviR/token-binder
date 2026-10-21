// The extension side of the leagues (client + controller) talking to the real server code over an in-memory database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BATTLE_VERSION } from '../src/game/battle';
import { GameState, XP_PER_LEVEL, addCards, newState } from '../src/game/engine';
import { parseCard } from '../src/game/cardData';
import { LOSS_XP, WIN_XP } from '../src/game/leaders';
import { LeagueClient } from '../src/online/client';
import { LeagueController, LeagueHost } from '../src/online/controller';
import { route } from '../server/lib/router';
import { CARDS, T0, World, world } from './helpers/leagueWorld';

interface Player { host: LeagueHost; ctl: LeagueController; state: GameState; posts: any[]; battles: any[]; notes: string[]; settings: { enabled: boolean }; saved: { n: number }; secrets: Map<string, string> }

/** One player's extension: its own client, session store, saved progress and screens. */
function player(w: World, token: string, cardId: string, level: number): Player {
  const secrets = new Map<string, string>();
  const settings = { enabled: false };
  const memory = new Map<string, unknown>();
  const posts: any[] = [], battles: any[] = [], notes: string[] = [], saved = { n: 0 };
  const card = parseCard(CARDS[cardId])!; card.era = 'vintage';
  const state = newState(0);
  addCards(state, [card]);
  state.collection[cardId].xp = (level - 1) * XP_PER_LEVEL;
  state.fighter = cardId;

  const fakeFetch = (async (url: string, init: any) => {
    const u = new URL(url);
    const res = await route(w.d, { method: init.method, path: u.pathname.replace('/api/v1', ''), query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    return { ok: res.status < 400, status: res.status, json: async () => res.body } as Response;
  }) as unknown as typeof fetch;
  const client = new LeagueClient({
    serverUrl: () => 'https://league.test/', secrets: { get: async k => secrets.get(k), store: async (k, v) => { secrets.set(k, v); }, delete: async k => { secrets.delete(k); } },
    githubToken: async () => token, fetch: fakeFetch, battleVersion: BATTLE_VERSION,
  });
  const host: LeagueHost = {
    client, getState: () => state, save: async () => { saved.n++; }, refresh: async () => {}, quotaPct: () => 50,
    enabled: () => settings.enabled, setEnabled: async on => { settings.enabled = on; },
    confirmConsent: async () => true, confirm: async () => true,
    notify: async (m, ..._a) => { notes.push(m); return undefined; },
    post: d => posts.push(d), sendBattle: d => battles.push(d), thumb: c => 'img/' + c.id, openExternal: () => {}, copy: () => {},
    serverUrl: () => 'https://league.test', memory: { get: (k, f) => (memory.has(k) ? memory.get(k) as never : f), set: async (k, v) => { memory.set(k, v); } },
    now: () => w.clock.t, t: (k, ...a) => k + ':' + a.join(','),
  };
  return { host, ctl: new LeagueController(host), state, posts, battles, notes, settings, saved, secrets };
}

const last = (p: Player) => p.posts.at(-1).data;

test('before connecting: the tab offers to connect, and nothing is sent anywhere', async () => {
  const w = await world();
  const a = player(w, 'tokA', 'base1-4', 8);
  await a.ctl.open();
  assert.equal(last(a).connected, false);
  assert.equal(last(a).configured, true);
  assert.equal((await w.d.db.query('select 1 from players')).length, 0);
  await a.ctl.poll();   // the timer: still nothing, because it is off
  assert.equal((await w.d.db.query('select 1 from players')).length, 0);
});

test('connect: consent, the setting is turned on, the fighter is registered and the league can be created', async () => {
  const w = await world();
  const a = player(w, 'tokA', 'base1-4', 8);
  await a.ctl.handle({ type: 'leagueConnect' });
  assert.equal(a.settings.enabled, true);
  assert.equal(last(a).connected, true);
  assert.equal(last(a).login, 'ash');
  assert.equal(last(a).registered.name, 'Charizard');
  assert.equal(last(a).registered.level, 8);
  assert.ok(a.secrets.size === 1, 'the session is kept in the secret store');

  await a.ctl.handle({ type: 'leagueCreate', name: 'Pallet Town' });
  const d = last(a);
  assert.equal(d.leagues.length, 1);
  assert.equal(d.board.league.name, 'Pallet Town');
  assert.equal(d.board.members[0].fighter.src, 'img/base1-4', 'thumbnails come from the host');
  assert.equal(d.error, undefined);
});

test('declining the data notice signs nobody in', async () => {
  const w = await world();
  const a = player(w, 'tokA', 'base1-4', 8);
  a.host.confirmConsent = async () => false;
  await a.ctl.handle({ type: 'leagueConnect' });
  assert.equal(last(a).connected, false);
  assert.equal(a.settings.enabled, false);
  assert.equal((await w.d.db.query('select 1 from players')).length, 0);
});

test('errors reach the tab as codes: a wrong invite code, and an inflated level that the server clamps', async () => {
  const w = await world();
  const a = player(w, 'tokA', 'base1-4', 50);
  await a.ctl.handle({ type: 'leagueConnect' });
  assert.equal(last(a).registered.clamped, true);
  assert.equal(last(a).registered.level, 10);
  await a.ctl.handle({ type: 'leagueJoin', code: 'ZZZZ-ZZZZ' });
  assert.equal(last(a).error, 'unknown-code');
  await a.ctl.handle({ type: 'leagueJoin', code: 'bad' });
  assert.equal(last(a).error, 'invalid-code');
});

test('a duel: the arena gets the whole fight, the card learns, and the other player is told and can watch it', async () => {
  const w = await world();
  const a = player(w, 'tokA', 'base1-4', 8);
  const b = player(w, 'tokB', 'base1-58', 8);
  await a.ctl.handle({ type: 'leagueConnect' });
  await a.ctl.handle({ type: 'leagueCreate', name: 'Pallet Town' });
  await b.ctl.handle({ type: 'leagueConnect' });
  await b.ctl.handle({ type: 'leagueJoin', code: last(a).board.league.code });
  await a.ctl.handle({ type: 'leagueRefresh' });
  const misty = last(a).board.members.find((m: any) => m.login === 'misty');

  const xpBefore = a.state.collection['base1-4'].xp;
  await a.ctl.handle({ type: 'leagueChallenge', rival: misty.id });
  assert.equal(a.battles.length, 1);
  const r = a.battles[0];
  assert.equal(r.leader.name, 'misty');
  assert.equal(r.log.at(-1).t, 'end');
  assert.equal(typeof r.odds, 'number');
  assert.equal(r.me.name, 'Charizard');
  assert.equal(r.foe.name, 'Pikachu');
  assert.deepEqual(r.me.moves, ['Fire Spin']);
  assert.ok(r.duel && r.duel.rival === 'misty');
  assert.equal(r.outcome.coins, 0, 'no coins: duels never inflate the economy');
  assert.equal(r.outcome.xp, r.won ? WIN_XP : LOSS_XP);
  assert.equal(a.state.collection['base1-4'].xp, xpBefore + r.outcome.xp);
  assert.ok(a.saved.n >= 1);
  assert.equal(last(a).board.today.used, 1);

  await b.ctl.poll();
  assert.equal(b.notes.length, 1);
  assert.match(b.notes[0], r.won ? /league\.incomingLost/ : /league\.incomingWon/);
  assert.equal(last(b).replays.length, 1);
  await b.ctl.handle({ type: 'leagueReplay', id: last(b).replays[0].id });
  const seen = b.battles[0];
  assert.equal(seen.duel.incoming, true);
  assert.equal(seen.won, !r.won);
  assert.equal(seen.me.name, 'Pikachu');
  assert.equal(seen.log.at(-1).winner, seen.won ? 'a' : 'b', 'the replay is told from the defender\'s side');
  assert.equal(b.state.collection['base1-58'].xp, 7 * XP_PER_LEVEL, 'being challenged gives no XP');
  await b.ctl.poll();
  assert.equal(b.notes.length, 1, 'announced only once');
});

test('a fighter that cannot fight (soaked) is not registered, and challenging says why', async () => {
  const w = await world();
  const a = player(w, 'tokA', 'base1-4', 8);
  await a.ctl.handle({ type: 'leagueConnect' });
  await a.ctl.handle({ type: 'leagueCreate', name: 'Pallet Town' });
  a.state.collection['base1-4'].soaked = true;
  await a.ctl.handle({ type: 'leagueRefresh' });
  assert.equal(last(a).registered, undefined);
  assert.equal(last(a).local.ok, false);
  assert.equal(last(a).local.reason, 'soaked');
});

test('delete my data: the server forgets the player, the session is dropped and the tab goes back to the intro', async () => {
  const w = await world();
  const a = player(w, 'tokA', 'base1-4', 8);
  await a.ctl.handle({ type: 'leagueConnect' });
  await a.ctl.handle({ type: 'leagueCreate', name: 'Pallet Town' });
  assert.equal(await a.ctl.deleteData(), true);
  assert.equal(last(a).connected, false);
  assert.equal(last(a).notice, 'deleted');
  assert.equal(a.secrets.size, 0);
  assert.equal((await w.d.db.query('select 1 from players')).length, 0);
  assert.equal((await w.d.db.query('select 1 from leagues')).length, 0);

  const cancel = player(w, 'tokB', 'base1-58', 8);
  cancel.host.confirm = async () => false;
  await cancel.ctl.handle({ type: 'leagueConnect' });
  assert.equal(await cancel.ctl.deleteData(), false, 'declining the confirmation deletes nothing');
  assert.equal((await w.d.db.query('select 1 from players')).length, 1);
});

test('a server that needs newer battle rules: the player is told to update', async () => {
  const w = await world();
  const a = player(w, 'tokA', 'base1-4', 8);
  await a.ctl.handle({ type: 'leagueConnect' });
  // The same extension, but from before a rules change: it must be told to update, not play with different rules.
  const old = new LeagueClient({ serverUrl: () => 'https://league.test', secrets: { get: async () => [...a.secrets.values()][0], store: async () => {}, delete: async () => {} }, githubToken: async () => 'tokA',
    battleVersion: BATTLE_VERSION - 1, fetch: (async (url: string, init: any) => { const u = new URL(url); const res = await route(w.d, { method: init.method, path: u.pathname.replace('/api/v1', ''), query: {}, body: undefined, headers: init.headers }); return { ok: res.status < 400, status: res.status, json: async () => res.body } as Response; }) as unknown as typeof fetch });
  const r = await old.call('GET', '/leagues');
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.error, 'update-required');
  assert.equal(!r.ok && r.battleVersion, BATTLE_VERSION);
  void T0;
});

test('offline: calls fail with a code instead of throwing', async () => {
  const c = new LeagueClient({
    serverUrl: () => 'https://league.test', secrets: { get: async () => 'x.y', store: async () => {}, delete: async () => {} }, githubToken: async () => undefined,
    battleVersion: BATTLE_VERSION, fetch: (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch,
  });
  const r = await c.call('GET', '/leagues');
  assert.deepEqual(r, { ok: false, error: 'offline', status: 0 });
  const none = new LeagueClient({ serverUrl: () => '  ', secrets: { get: async () => undefined, store: async () => {}, delete: async () => {} }, githubToken: async () => undefined, battleVersion: 1, fetch });
  assert.equal(none.configured, false);
  assert.equal((await none.connect(true)).ok, false);
});

test('the server address must be https (or a local server): the GitHub token is never sent anywhere else', async () => {
  const calls: string[] = [];
  const mk = (url: string) => new LeagueClient({
    serverUrl: () => url, secrets: { get: async () => 'x.y', store: async () => {}, delete: async () => {} }, githubToken: async () => 'tok', battleVersion: 1,
    fetch: (async (u: string) => { calls.push(u); throw new TypeError('x'); }) as unknown as typeof fetch,
  });
  for (const bad of ['http://evil.example', 'ftp://x.y', 'javascript:alert(1)', 'https://', 'https:// spaced.example', 'evil.example', 'http://localhost.evil.example']) {
    const c = mk(bad);
    assert.equal(c.configured, false, bad);
    assert.deepEqual(await c.call('GET', '/leagues'), { ok: false, error: 'no-server', status: 0 }, bad);
  }
  assert.deepEqual(calls, [], 'nothing was sent');
  for (const good of ['https://league.example.com', 'https://league.example.com/', 'http://localhost:3000', 'http://127.0.0.1:3000/x']) { assert.equal(mk(good).configured, true, good); }
  assert.equal(mk('https://league.example.com/').host, 'league.example.com');
});
