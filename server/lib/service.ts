// What the league server does, with no HTTP in it: every function takes the dependencies it needs and returns a plain result,
// so the whole flow can be tested against an in-memory database.
import { BattleEvent, Fighter, makeFighter, simulate, BATTLE_VERSION } from '../../src/game/battle';
import { levelOf } from '../../src/game/engine';
import { tokensBonus } from '../../src/game/strength';
import { FetchJson, SESSION_DAYS, githubUser, signSession } from './auth';
import { getCard } from './cards';
import type { Db } from './db';
import {
  DAILY_DUELS, DAILY_PER_RIVAL, MAX_JOINED_LEAGUES, MAX_MEMBERS, MAX_OWNED_LEAGUES,
  SEASON_PODIUM, checkClaim, cleanLeagueName, eloDelta, inviteCode, isImplausible, isImplausibleFirst, normalizeCode, readProfile, seasonEnd, seasonOf, softElo,
} from './rules';

export interface Deps { db: Db; now: () => number; rng: () => number; fetchJson: FetchJson; secret: string }
export type Fail = { ok: false; error: string; status: number };
export type Result<T> = ({ ok: true } & T) | Fail;
const fail = (error: string, status = 400): Fail => ({ ok: false, error, status });

const DAY = 864e5;
const num = (x: unknown): number => Number(x);
const iso = (t: number): string => new Date(t).toISOString();
const startOfDay = (t: number): number => Math.floor(t / DAY) * DAY;

/* ───── players ───── */

/** Exchanges a GitHub token for a session. The player must have accepted the data notice (`consent`). */
export async function login(d: Deps, githubToken: unknown, consent: unknown): Promise<Result<{ token: string; id: number; login: string; battleVersion: number }>> {
  if (consent !== true) { return fail('consent-required'); }
  if (typeof githubToken !== 'string' || !githubToken) { return fail('github-rejected', 401); }
  const u = await githubUser(githubToken, d.fetchJson);
  if (!u) { return fail('github-rejected', 401); }
  await d.db.query(
    'insert into players (id, login, consent_at, created_at) values ($1, $2, $3, $3) on conflict (id) do update set login = excluded.login',
    [u.id, u.login, iso(d.now())]);
  const token = signSession({ sub: u.id, login: u.login, exp: d.now() + SESSION_DAYS * DAY }, d.secret);
  return { ok: true, token, id: u.id, login: u.login, battleVersion: BATTLE_VERSION };
}

/** When the player joined (the level cap grows from there), or undefined if they deleted their data. */
async function joinedAt(d: Deps, pid: number): Promise<number | undefined> {
  const r = await d.db.query<{ created_at: string }>('select created_at from players where id = $1', [pid]);
  return r[0] ? new Date(r[0].created_at).getTime() : undefined;
}

export async function playerExists(d: Deps, pid: number): Promise<boolean> {
  return (await joinedAt(d, pid)) !== undefined;
}

/** Everything the server holds about the player goes away, and the leagues they own pass to someone else (or end). */
export async function deleteMe(d: Deps, pid: number): Promise<Result<object>> {
  const owned = await d.db.query<{ id: number }>('select id from leagues where owner = $1', [pid]);
  for (const l of owned) { await passOrEndLeague(d, num(l.id), pid); }
  await d.db.query('delete from players where id = $1', [pid]);   // members, fighter and duels go with it
  return { ok: true };
}

/** The owner leaves: the oldest member takes over; with nobody left the league ends. */
async function passOrEndLeague(d: Deps, leagueId: number, leaving: number): Promise<void> {
  const next = await d.db.query<{ player_id: number }>(
    'select player_id from members where league_id = $1 and player_id <> $2 order by joined_at, player_id limit 1', [leagueId, leaving]);
  if (next[0]) { await d.db.query('update leagues set owner = $1 where id = $2', [num(next[0].player_id), leagueId]); }
  else { await d.db.query('delete from leagues where id = $1', [leagueId]); }
}

/* ───── leagues ───── */

async function isMember(d: Deps, leagueId: number, pid: number): Promise<boolean> {
  return (await d.db.query('select 1 from members where league_id = $1 and player_id = $2', [leagueId, pid])).length > 0;
}

const countJoined = async (d: Deps, pid: number): Promise<number> =>
  num((await d.db.query<{ n: number }>('select count(*)::int as n from members where player_id = $1', [pid]))[0].n);

export async function createLeague(d: Deps, pid: number, rawName: unknown): Promise<Result<{ league: { id: number; name: string; code: string } }>> {
  const name = cleanLeagueName(rawName);
  if (!name) { return fail('invalid-name'); }
  const owned = num((await d.db.query<{ n: number }>('select count(*)::int as n from leagues where owner = $1', [pid]))[0].n);
  if (owned >= MAX_OWNED_LEAGUES) { return fail('too-many-owned'); }
  if (await countJoined(d, pid) >= MAX_JOINED_LEAGUES) { return fail('too-many-joined'); }
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = inviteCode(d.rng);
    const row = await d.db.query<{ id: number }>('insert into leagues (name, code, owner, created_at, season) values ($1, $2, $3, $4, $5) on conflict (code) do nothing returning id', [name, code, pid, iso(d.now()), seasonOf(d.now())]);
    if (!row[0]) { continue; }
    const id = num(row[0].id);
    await d.db.query('insert into members (league_id, player_id, joined_at) values ($1, $2, $3)', [id, pid, iso(d.now())]);
    return { ok: true, league: { id, name, code } };
  }
  return fail('try-again', 503);
}

export async function joinLeague(d: Deps, pid: number, rawCode: unknown): Promise<Result<{ league: { id: number; name: string; code: string } }>> {
  const code = typeof rawCode === 'string' ? normalizeCode(rawCode) : undefined;
  if (!code) { return fail('invalid-code'); }
  const l = (await d.db.query<{ id: number; name: string }>('select id, name from leagues where code = $1', [code]))[0];
  if (!l) { return fail('unknown-code', 404); }
  const id = num(l.id);
  if (!(await isMember(d, id, pid))) {
    if (await countJoined(d, pid) >= MAX_JOINED_LEAGUES) { return fail('too-many-joined'); }
    const n = num((await d.db.query<{ n: number }>('select count(*)::int as n from members where league_id = $1', [id]))[0].n);
    if (n >= MAX_MEMBERS) { return fail('league-full'); }
    // If the player was here before, restore the standing they left with instead of starting fresh at 1000.
    const past = (await d.db.query<{ elo: number; wins: number; losses: number }>(
      'select elo, wins, losses from member_stats where league_id = $1 and player_id = $2', [id, pid]))[0];
    await d.db.query('insert into members (league_id, player_id, elo, wins, losses, joined_at) values ($1, $2, $3, $4, $5, $6)',
      [id, pid, past ? num(past.elo) : 1000, past ? num(past.wins) : 0, past ? num(past.losses) : 0, iso(d.now())]);
  }
  return { ok: true, league: { id, name: l.name, code } };
}

export async function leaveLeague(d: Deps, pid: number, leagueId: number): Promise<Result<object>> {
  if (!(await isMember(d, leagueId, pid))) { return fail('not-member', 404); }
  const owner = (await d.db.query<{ owner: number }>('select owner from leagues where id = $1', [leagueId]))[0];
  if (owner && num(owner.owner) === pid) { await passOrEndLeague(d, leagueId, pid); }
  // Remember the standing so coming back does not wipe a losing record (member_stats survives the member row).
  await d.db.query(
    `insert into member_stats (league_id, player_id, elo, wins, losses)
     select league_id, player_id, elo, wins, losses from members where league_id = $1 and player_id = $2
     on conflict (league_id, player_id) do update set elo = excluded.elo, wins = excluded.wins, losses = excluded.losses`,
    [leagueId, pid]);
  await d.db.query('delete from members where league_id = $1 and player_id = $2', [leagueId, pid]);
  return { ok: true };
}

export async function myLeagues(d: Deps, pid: number): Promise<Result<{ leagues: { id: number; name: string; code: string; elo: number; members: number }[] }>> {
  const rows = await d.db.query<{ id: number; name: string; code: string; elo: number; members: number }>(
    `select l.id, l.name, l.code, m.elo,
            (select count(*)::int from members x where x.league_id = l.id) as members
       from members m join leagues l on l.id = m.league_id
      where m.player_id = $1 order by m.joined_at`, [pid]);
  return { ok: true, leagues: rows.map(r => ({ id: num(r.id), name: r.name, code: r.code, elo: num(r.elo), members: num(r.members) })) };
}

/* ───── fighters ───── */

export interface FighterView {
  cardId: string; image?: string; key: string; name: string; types: string[]; tier: number; level: number; grade?: number; held?: string;
}

export async function registerFighter(d: Deps, pid: number, raw: unknown): Promise<Result<{ fighter: FighterView; clamped: boolean; levelCap: number; busted: boolean }>> {
  const since = await joinedAt(d, pid);
  if (since === undefined) { return fail('unknown-player', 401); }
  // The whole-save report is how a fighter is vetted; a client that does not send it (an older version) cannot field one.
  if (typeof (raw as { profile?: unknown } | null)?.profile !== 'object' || (raw as { profile?: unknown }).profile === null) { return fail('update-required', 426); }
  const check = checkClaim(raw, since, d.now());
  if (!check.ok) { return fail(check.error); }
  const c = check.claim;
  const card = await getCard(d.db, c.key, d.fetchJson, d.now());
  if (!card) { return fail('card-unavailable', 422); }
  await d.db.query(
    `insert into fighters (player_id, card_key, xp, grade, held, quota_pct, updated_at) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (player_id) do update set card_key = excluded.card_key, xp = excluded.xp, grade = excluded.grade, held = excluded.held,
       quota_pct = excluded.quota_pct, updated_at = excluded.updated_at`,
    [pid, c.key, c.xp, c.grade ?? null, c.held ?? null, c.quotaPct, iso(d.now())]);
  const busted = await checkProfile(d, pid, raw, c.xp);
  return { ok: true, clamped: check.clamped, levelCap: check.cap, busted, fighter: { cardId: card.id, image: card.image, key: c.key, name: card.name, types: card.types ?? [], tier: card.tier, level: levelOf(c.xp), grade: c.grade, held: c.held } };
}

/**
 * Reads the whole-save report that rides along with the fighter and flags the player BUSTED if it is impossible for the
 * real time passed since the last accepted report (or, for the first one, for the lifetime tokens it claims). Once flagged,
 * it stays flagged until a league pardons them there or they are reborn (a later honest report does not quietly undo it).
 */
async function checkProfile(d: Deps, pid: number, raw: unknown, claimXp: number): Promise<boolean> {
  const p = readProfile((raw as { profile?: unknown })?.profile);
  const row = (await d.db.query<{ busted: boolean; allow_profile: Record<string, unknown>; allow_at: string }>(
    'select busted, allow_profile, allow_at from players where id = $1', [pid]))[0];
  if (!row) { return false; }
  if (row.busted) { return true; }
  const first = Object.keys(row.allow_profile ?? {}).length === 0;
  // The fighter's XP is part of the save's total: a fighter with more XP than the whole save has is a made-up number.
  const bad = claimXp > p.xp + 1 || (first ? isImplausibleFirst(p) : isImplausible(p, readProfile(row.allow_profile), d.now() - new Date(row.allow_at).getTime()));
  if (bad) {
    await d.db.query('update players set busted = true where id = $1', [pid]);
    await d.db.query('update members set pardoned = false where player_id = $1', [pid]);
    return true;
  }
  // Accepted: this report is the baseline the next one grows from, so a slow edit is bounded per report, not per lifetime.
  await d.db.query('update players set allow_profile = $1, allow_at = $2 where id = $3', [JSON.stringify(p), iso(d.now()), pid]);
  return false;
}

/** A BUSTED player, as far as one league is concerned: flagged, and not (yet) vouched for by that league. */
async function bustedIn(d: Deps, leagueId: number, pid: number): Promise<boolean> {
  const r = await d.db.query<{ b: boolean }>(
    'select (p.busted and not m.pardoned) as b from members m join players p on p.id = m.player_id where m.league_id = $1 and m.player_id = $2', [leagueId, pid]);
  return !!r[0]?.b;
}

/**
 * A majority of the other members of a league can lift a BUSTED flag *in that league*; being reborn (below) is the player's own
 * way out everywhere. The pardon stays local on purpose: otherwise a player could vouch for themselves in a private league
 * with a second account and be cleared in every league they are in.
 */
export async function pardon(d: Deps, pid: number, leagueId: number, subject: number): Promise<Result<{ pardoned: boolean; votes: number; need: number }>> {
  if (!Number.isInteger(subject) || subject === pid) { return fail('invalid-subject'); }
  if (!(await isMember(d, leagueId, pid))) { return fail('not-member', 404); }
  if (!(await isMember(d, leagueId, subject))) { return fail('subject-not-member', 404); }
  if (!(await bustedIn(d, leagueId, subject))) { return fail('not-busted'); }
  await d.db.query('insert into pardons (league_id, subject, voter, created_at) values ($1, $2, $3, $4) on conflict do nothing', [leagueId, subject, pid, iso(d.now())]);
  const total = num((await d.db.query<{ n: number }>('select count(*)::int as n from members where league_id = $1', [leagueId]))[0].n);
  const need = Math.floor((total - 1) / 2) + 1;
  // Only votes from people who are still in the league count.
  const votes = num((await d.db.query<{ n: number }>(
    'select count(*)::int as n from pardons v join members m on m.league_id = v.league_id and m.player_id = v.voter where v.league_id = $1 and v.subject = $2', [leagueId, subject]))[0].n);
  if (votes >= need) {
    await d.db.query('update members set pardoned = true where league_id = $1 and player_id = $2', [leagueId, subject]);
    await d.db.query('delete from pardons where league_id = $1 and subject = $2', [leagueId, subject]);
    return { ok: true, pardoned: true, votes, need };
  }
  return { ok: true, pardoned: false, votes, need };
}

/** "I was a cheater and want to play again": clears the flag and the baseline. The next report is judged from scratch, so a save that was not really reset is flagged again at once. */
export async function reborn(d: Deps, pid: number): Promise<Result<object>> {
  await d.db.query(`update players set busted = false, allow_profile = '{}', allow_at = $1 where id = $2`, [iso(d.now()), pid]);
  await d.db.query('update members set pardoned = false where player_id = $1', [pid]);
  await d.db.query('delete from pardons where subject = $1', [pid]);
  return { ok: true };
}

interface FighterRow { player_id: number; card_key: string; xp: number; grade: number | null; held: string | null; quota_pct: number }

const fighterRow = async (d: Deps, pid: number): Promise<FighterRow | undefined> =>
  (await d.db.query<FighterRow>('select player_id, card_key, xp, grade, held, quota_pct from fighters where player_id = $1', [pid]))[0];

/* ───── seasons ───── */

export interface SeasonView { id: string; endsAt: string }
export interface Podium { season: string; entries: { rank: number; login: string; elo: number; wins: number; losses: number }[] }
const seasonView = (now: number): SeasonView => ({ id: seasonOf(now), endsAt: iso(seasonEnd(now)) });

/**
 * Moves a league to the current month. Whoever flips `leagues.season` first (one guarded UPDATE, so concurrent requests cannot both
 * do it) archives the finished season's podium and pulls everyone's Elo halfway back to the start with a clean record. Players
 * flagged BUSTED, and players who never fought, do not make the podium. A league from before seasons (no season yet) just adopts the
 * current one, and a league that sat idle for months archives only the last season it played.
 */
async function rollSeason(d: Deps, leagueId: number): Promise<void> {
  const cur = seasonOf(d.now());
  const flipped = await d.db.query<{ prev: string | null }>(
    `with old as (select season from leagues where id = $2)
     update leagues set season = $1 where id = $2 and season is distinct from $1 returning (select season from old) as prev`, [cur, leagueId]);
  const prev = flipped[0]?.prev;
  if (!flipped[0] || !prev) { return; }
  const top = await d.db.query<{ player_id: number; login: string; elo: number; wins: number; losses: number }>(
    `select m.player_id, p.login, m.elo, m.wins, m.losses from members m join players p on p.id = m.player_id
      where m.league_id = $1 and not (p.busted and not m.pardoned) and m.wins + m.losses > 0
      order by m.elo desc, m.wins desc, p.login limit $2`, [leagueId, SEASON_PODIUM]);
  for (let i = 0; i < top.length; i++) {
    const r = top[i];
    await d.db.query(
      'insert into league_seasons (league_id, season, rank, player_id, login, elo, wins, losses) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing',
      [leagueId, prev, i + 1, num(r.player_id), r.login, num(r.elo), num(r.wins), num(r.losses)]);
  }
  for (const table of ['members', 'member_stats']) {
    const rows = await d.db.query<{ player_id: number; elo: number }>(`select player_id, elo from ${table} where league_id = $1`, [leagueId]);
    for (const r of rows) { await d.db.query(`update ${table} set elo = $1, wins = 0, losses = 0 where league_id = $2 and player_id = $3`, [softElo(num(r.elo)), leagueId, num(r.player_id)]); }
  }
}

/** The podium of the last finished season of a league, if there has been one. */
async function podium(d: Deps, leagueId: number): Promise<Podium | null> {
  const last = (await d.db.query<{ season: string }>('select season from league_seasons where league_id = $1 order by season desc limit 1', [leagueId]))[0];
  if (!last) { return null; }
  const rows = await d.db.query<{ rank: number; login: string; elo: number; wins: number; losses: number }>(
    'select rank, login, elo, wins, losses from league_seasons where league_id = $1 and season = $2 order by rank', [leagueId, last.season]);
  return { season: last.season, entries: rows.map(r => ({ rank: num(r.rank), login: r.login, elo: num(r.elo), wins: num(r.wins), losses: num(r.losses) })) };
}

/* ───── the league board ───── */

export interface MemberView { id: number; login: string; elo: number; wins: number; losses: number; fighter?: FighterView; you: boolean; busted: boolean; crowns: number; bustVotes?: number; youPardoned?: boolean }
export interface DuelLine { id: number; challenger: string; defender: string; winner: string; rounds: number; eloChange: number; at: string; you?: 'challenger' | 'defender' }

async function recentDuels(d: Deps, leagueId: number, limit: number, pid?: number): Promise<DuelLine[]> {
  const rows = await d.db.query<{ id: number; c: string; df: string; cid: number; did: number; winner: string; rounds: number; elo_change: number; created_at: string }>(
    `select u.id, pc.login as c, pd.login as df, u.challenger as cid, u.defender as did, u.winner, u.rounds, u.elo_change, u.created_at
       from duels u join players pc on pc.id = u.challenger join players pd on pd.id = u.defender
      where u.league_id = $1 order by u.id desc limit $2`, [leagueId, limit]);
  return rows.map(r => ({
    id: num(r.id), challenger: r.c, defender: r.df, winner: r.winner === 'a' ? r.c : r.df, rounds: num(r.rounds), eloChange: num(r.elo_change),
    at: new Date(r.created_at).toISOString(),
    you: pid === undefined ? undefined : num(r.cid) === pid ? 'challenger' : num(r.did) === pid ? 'defender' : undefined,
  }));
}

async function membersOf(d: Deps, leagueId: number, me?: number): Promise<MemberView[]> {
  // Busted players are forced to the bottom of the ranking, whatever their Elo.
  const rows = await d.db.query<{ id: number; login: string; busted: boolean; elo: number; wins: number; losses: number; crowns: number; card_key: string | null; xp: number | null; grade: number | null; held: string | null; data: any }>(
    `select p.id, p.login, (p.busted and not m.pardoned) as busted, m.elo, m.wins, m.losses, f.card_key, f.xp, f.grade, f.held, c.data,
            (select count(*)::int from league_seasons s where s.league_id = m.league_id and s.player_id = p.id and s.rank = 1) as crowns
       from members m join players p on p.id = m.player_id
       left join fighters f on f.player_id = p.id
       left join cards c on c.id = split_part(f.card_key, '#', 1)
      where m.league_id = $1 order by (p.busted and not m.pardoned) asc, m.elo desc, m.wins desc, p.login`, [leagueId]);
  return rows.map(r => ({
    id: num(r.id), login: r.login, busted: !!r.busted, elo: num(r.elo), wins: num(r.wins), losses: num(r.losses), crowns: num(r.crowns), you: me !== undefined && num(r.id) === me,
    fighter: r.card_key && r.data ? {
      cardId: r.data.id, image: r.data.image, key: r.card_key, name: r.data.name, types: r.data.types ?? [], tier: r.data.tier,
      level: levelOf(num(r.xp)), grade: r.grade ?? undefined, held: r.held ?? undefined,
    } : undefined,
  }));
}

export async function leagueView(d: Deps, pid: number, leagueId: number):
  Promise<Result<{ league: { id: number; name: string; code: string }; members: MemberView[]; duels: DuelLine[]; today: { used: number; max: number }; pardonNeed: number; season: SeasonView; podium: Podium | null }>> {
  if (!(await isMember(d, leagueId, pid))) { return fail('not-member', 404); }
  await rollSeason(d, leagueId);
  const l = (await d.db.query<{ id: number; name: string; code: string }>('select id, name, code from leagues where id = $1', [leagueId]))[0];
  const used = num((await d.db.query<{ n: number }>('select count(*)::int as n from duels where challenger = $1 and created_at >= $2', [pid, iso(startOfDay(d.now()))]))[0].n);
  const members = await membersOf(d, leagueId, pid);
  // A busted player is cleared by a majority of the OTHER members voting to pardon them; show the tally.
  const need = Math.floor((members.length - 1) / 2) + 1;
  if (members.some(m => m.busted)) {
    const votes = await d.db.query<{ subject: number; voter: number }>(
      'select v.subject, v.voter from pardons v join members m on m.league_id = v.league_id and m.player_id = v.voter where v.league_id = $1', [leagueId]);
    for (const m of members) {
      if (!m.busted) { continue; }
      const vs = votes.filter(v => num(v.subject) === m.id);
      m.bustVotes = vs.length;
      m.youPardoned = vs.some(v => num(v.voter) === pid);
    }
  }
  return {
    ok: true, league: { id: num(l.id), name: l.name, code: l.code }, members,
    duels: await recentDuels(d, leagueId, 10, pid), today: { used, max: DAILY_DUELS }, pardonNeed: need,
    season: seasonView(d.now()), podium: await podium(d, leagueId),
  };
}

/** For the web page: whoever has the invite code can read the ranking (logins and results only). */
export async function publicLeague(d: Deps, rawCode: string): Promise<Result<{ name: string; members: Omit<MemberView, 'id' | 'you'>[]; duels: DuelLine[]; season: SeasonView; podium: Podium | null }>> {
  const code = normalizeCode(rawCode);
  const l = code ? (await d.db.query<{ id: number; name: string }>('select id, name from leagues where code = $1', [code]))[0] : undefined;
  if (!l) { return fail('unknown-code', 404); }
  await rollSeason(d, num(l.id));
  const members = (await membersOf(d, num(l.id))).map(({ id: _id, you: _you, ...m }) => m);
  return { ok: true, name: l.name, members, duels: await recentDuels(d, num(l.id), 15), season: seasonView(d.now()), podium: await podium(d, num(l.id)) };
}

/* ───── duels ───── */

function snapshot(f: Fighter, row: FighterRow, card: { id: string; image?: string; tier: number }): Fighter & { cardId: string; image?: string; tier: number; cardKey: string; grade?: number } {
  return { ...f, cardId: card.id, image: card.image, tier: card.tier, cardKey: row.card_key, grade: row.grade ?? undefined };
}

/**
 * Takes one slot off a daily counter, atomically, and returns the new count — or null when the limit is already reached.
 * A single guarded UPSERT (the conflicting row is locked before the `where` is checked) makes concurrent challenges
 * serialize instead of racing, which counting the duels table did not.
 */
async function reserveDuel(d: Deps, challenger: number, defender: number, day: string, limit: number): Promise<number | null> {
  const r = await d.db.query<{ n: number }>(
    `insert into duel_quota (challenger, defender, day, n) values ($1, $2, $3, 1)
     on conflict (challenger, defender, day) do update set n = duel_quota.n + 1 where duel_quota.n < $4
     returning n`, [challenger, defender, day, limit]);
  return r[0] ? num(r[0].n) : null;
}

export async function challenge(d: Deps, pid: number, leagueId: number, rivalId: number): Promise<Result<{
  duelId: number; winner: 'a' | 'b'; won: boolean; rounds: number; reason: string; log: unknown[]; battleVersion: number;
  me: unknown; foe: unknown; rival: string; eloChange: number; elo: number; today: { used: number; max: number };
}>> {
  if (!Number.isInteger(rivalId) || rivalId === pid) { return fail('invalid-rival'); }
  if (!(await isMember(d, leagueId, pid))) { return fail('not-member', 404); }
  if (!(await isMember(d, leagueId, rivalId))) { return fail('rival-not-member', 404); }
  await rollSeason(d, leagueId);
  if (await bustedIn(d, leagueId, pid)) { return fail('busted', 403); }
  if (await bustedIn(d, leagueId, rivalId)) { return fail('rival-busted', 403); }
  const mine = await fighterRow(d, pid);
  if (!mine) { return fail('no-fighter'); }
  const theirs = await fighterRow(d, rivalId);
  if (!theirs) { return fail('rival-no-fighter'); }

  // Reserve a slot before doing any work, atomically (see duel_quota): firing many duels at once can no longer slip past
  // the daily limits. The tighter per-rival counter is taken first; its only possible over-count is against a rival who
  // is already capped for the day, which changes nothing.
  const dayKey = iso(startOfDay(d.now())).slice(0, 10);
  if (await reserveDuel(d, pid, rivalId, dayKey, DAILY_PER_RIVAL) === null) { return fail('rival-limit', 429); }
  const dayN = await reserveDuel(d, pid, 0, dayKey, DAILY_DUELS);
  if (dayN === null) { return fail('daily-limit', 429); }

  const cardA = await getCard(d.db, mine.card_key, d.fetchJson, d.now());
  const cardB = await getCard(d.db, theirs.card_key, d.fetchJson, d.now());
  if (!cardA || !cardB) { return fail('card-unavailable', 503); }
  const qa = num(mine.quota_pct), qb = num(theirs.quota_pct);
  const a = makeFighter(`duel:${pid}`, cardA, num(mine.xp), { grade: mine.grade ?? undefined, tokensBonus: tokensBonus(qa, qb), held: (mine.held ?? undefined) as never });
  const b = makeFighter(`duel:${rivalId}`, cardB, num(theirs.xp), { grade: theirs.grade ?? undefined, tokensBonus: tokensBonus(qb, qa), held: (theirs.held ?? undefined) as never });
  const seed = Math.floor(d.rng() * 0xffffffff);
  const result = simulate(a, b, seed);
  const won = result.winner === 'a';

  const elos = await d.db.query<{ player_id: number; elo: number }>('select player_id, elo from members where league_id = $1 and player_id in ($2, $3)', [leagueId, pid, rivalId]);
  const eloOf = (id: number) => num(elos.find(e => num(e.player_id) === id)!.elo);
  const delta = eloDelta(eloOf(pid), eloOf(rivalId), won);
  await d.db.query('update members set elo = elo + $1, wins = wins + $2, losses = losses + $3 where league_id = $4 and player_id = $5', [delta, won ? 1 : 0, won ? 0 : 1, leagueId, pid]);
  await d.db.query('update members set elo = elo - $1, wins = wins + $2, losses = losses + $3 where league_id = $4 and player_id = $5', [delta, won ? 0 : 1, won ? 1 : 0, leagueId, rivalId]);

  const snapA = snapshot(a, mine, cardA), snapB = snapshot(b, theirs, cardB);
  const row = await d.db.query<{ id: number }>(
    `insert into duels (league_id, challenger, defender, seed, battle_version, a, b, winner, elo_change, rounds, log, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
    [leagueId, pid, rivalId, seed, result.version, JSON.stringify(snapA), JSON.stringify(snapB), result.winner, delta, result.rounds, JSON.stringify(result.log), iso(d.now())]);
  const rivalLogin = (await d.db.query<{ login: string }>('select login from players where id = $1', [rivalId]))[0].login;
  return {
    ok: true, duelId: num(row[0].id), winner: result.winner, won, rounds: result.rounds, reason: result.reason, log: result.log, battleVersion: result.version,
    me: snapA, foe: snapB, rival: rivalLogin, eloChange: delta, elo: eloOf(pid) + delta, today: { used: dayN, max: DAILY_DUELS },
  };
}

const flip = (x: 'a' | 'b'): 'a' | 'b' => (x === 'a' ? 'b' : 'a');

/** The same fight seen from the other corner: the stored log is the challenger's ('a'), the defender watches it as 'a' too. */
export function mirrorLog(log: BattleEvent[]): BattleEvent[] {
  return log.map(e => e.t === 'start' ? { ...e, a: e.b, b: e.a }
    : e.t === 'attack' ? { ...e, side: flip(e.side), hp: { a: e.hp.b, b: e.hp.a } }
      : { ...e, winner: flip(e.winner), hp: { a: e.hp.b, b: e.hp.a } });
}

/** Duels other players started against you since you last looked. Returned once. */
export async function inbox(d: Deps, pid: number): Promise<Result<{ duels: {
  id: number; league: string; challenger: string; won: boolean; rounds: number; reason: string; log: unknown[]; battleVersion: number;
  me: unknown; foe: unknown; eloChange: number; at: string;
}[] }>> {
  const rows = await d.db.query<{ id: number; league: string; challenger: string; winner: string; rounds: number; log: unknown[]; battle_version: number; a: unknown; b: unknown; elo_change: number; created_at: string }>(
    `select u.id, l.name as league, p.login as challenger, u.winner, u.rounds, u.log, u.battle_version, u.a, u.b, u.elo_change, u.created_at
       from duels u join leagues l on l.id = u.league_id join players p on p.id = u.challenger
      where u.defender = $1 and not u.seen order by u.id desc limit 20`, [pid]);
  if (rows.length) { await d.db.query('update duels set seen = true where defender = $1 and id = any($2::int[])', [pid, rows.map(r => num(r.id))]); }
  return {
    ok: true,
    duels: rows.map(r => ({
      id: num(r.id), league: r.league, challenger: r.challenger, won: r.winner === 'b', rounds: num(r.rounds), reason: (r.log as any[]).at(-1)?.reason ?? 'ko',
      log: mirrorLog(r.log as BattleEvent[]), battleVersion: num(r.battle_version), me: r.b, foe: r.a, eloChange: -num(r.elo_change), at: new Date(r.created_at).toISOString(),
    })),
  };
}
