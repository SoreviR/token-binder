// What the league server does, with no HTTP in it: every function takes the dependencies it needs and returns a plain result,
// so the whole flow can be tested against an in-memory database.
import { BattleEvent, Fighter, makeFighter, simulate, BATTLE_VERSION } from '../../src/game/battle';
import { levelOf } from '../../src/game/engine';
import { gradeMultiplier } from '../../src/game/grading';
import { marketValue } from '../../src/game/market';
import { tokensBonus } from '../../src/game/strength';
import { TEAM_EXTRAS, simulateTeam } from '../../src/game/team';
import { FetchJson, SESSION_DAYS, githubUser, signSession } from './auth';
import { cardIdOf, getCard } from './cards';
import type { Db } from './db';
import {
  DAILY_DUELS, DAILY_PER_RIVAL, LeagueMode, MAX_JOINED_LEAGUES, MAX_MEMBERS, MAX_OWNED_LEAGUES,
  SEASON_PODIUM, checkClaim, checkTeam, isCardKey, cleanLeagueName, eloDelta, inviteCode, isImplausible, isImplausibleFirst, normalizeCode, readMode, readProfile, seasonEnd, seasonOf, softElo,
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

export async function createLeague(d: Deps, pid: number, rawName: unknown, rawMode?: unknown): Promise<Result<{ league: { id: number; name: string; code: string; mode: LeagueMode } }>> {
  const name = cleanLeagueName(rawName);
  if (!name) { return fail('invalid-name'); }
  const mode = readMode(rawMode);
  const owned = num((await d.db.query<{ n: number }>('select count(*)::int as n from leagues where owner = $1', [pid]))[0].n);
  if (owned >= MAX_OWNED_LEAGUES) { return fail('too-many-owned'); }
  if (await countJoined(d, pid) >= MAX_JOINED_LEAGUES) { return fail('too-many-joined'); }
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = inviteCode(d.rng);
    const row = await d.db.query<{ id: number }>('insert into leagues (name, code, owner, created_at, season, mode) values ($1, $2, $3, $4, $5, $6) on conflict (code) do nothing returning id', [name, code, pid, iso(d.now()), seasonOf(d.now()), mode]);
    if (!row[0]) { continue; }
    const id = num(row[0].id);
    await d.db.query('insert into members (league_id, player_id, joined_at) values ($1, $2, $3)', [id, pid, iso(d.now())]);
    return { ok: true, league: { id, name, code, mode } };
  }
  return fail('try-again', 503);
}

export async function joinLeague(d: Deps, pid: number, rawCode: unknown): Promise<Result<{ league: { id: number; name: string; code: string; mode: LeagueMode } }>> {
  const code = typeof rawCode === 'string' ? normalizeCode(rawCode) : undefined;
  if (!code) { return fail('invalid-code'); }
  const l = (await d.db.query<{ id: number; name: string; mode: string }>('select id, name, mode from leagues where code = $1', [code]))[0];
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
  return { ok: true, league: { id, name: l.name, code, mode: readMode(l.mode) } };
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

export async function myLeagues(d: Deps, pid: number): Promise<Result<{ leagues: { id: number; name: string; code: string; elo: number; members: number; mode: LeagueMode }[] }>> {
  const rows = await d.db.query<{ id: number; name: string; code: string; elo: number; members: number; mode: string }>(
    `select l.id, l.name, l.code, l.mode, m.elo,
            (select count(*)::int from members x where x.league_id = l.id) as members
       from members m join leagues l on l.id = m.league_id
      where m.player_id = $1 order by m.joined_at`, [pid]);
  return { ok: true, leagues: rows.map(r => ({ id: num(r.id), name: r.name, code: r.code, elo: num(r.elo), members: num(r.members), mode: readMode(r.mode) })) };
}

/* ───── fighters ───── */

export interface FighterView {
  cardId: string; image?: string; key: string; name: string; types: string[]; tier: number; level: number; grade?: number; held?: string;
}

type CardData = { id: string; image?: string; name: string; types?: string[]; tier: number };
const fighterView = (key: string, xp: number, grade: number | null | undefined, held: string | null | undefined, card: CardData): FighterView =>
  ({ cardId: card.id, image: card.image, key, name: card.name, types: card.types ?? [], tier: card.tier, level: levelOf(xp), grade: grade ?? undefined, held: held ?? undefined });

export async function registerFighter(d: Deps, pid: number, raw: unknown): Promise<Result<{ fighter: FighterView; team: FighterView[]; clamped: boolean; levelCap: number; busted: boolean }>> {
  const since = await joinedAt(d, pid);
  if (since === undefined) { return fail('unknown-player', 401); }
  // The whole-save report is how a fighter is vetted; a client that does not send it (an older version) cannot field one.
  if (typeof (raw as { profile?: unknown } | null)?.profile !== 'object' || (raw as { profile?: unknown }).profile === null) { return fail('update-required', 426); }
  const check = checkClaim(raw, since, d.now());
  if (!check.ok) { return fail(check.error); }
  const c = check.claim;
  // The two cards that back the fighter up in team leagues: checked and clamped like the fighter itself.
  const team = checkTeam((raw as { team?: unknown }).team, c.key, since, d.now());
  if (!team.ok) { return fail(team.error); }
  const card = await getCard(d.db, c.key, d.fetchJson, d.now());
  if (!card) { return fail('card-unavailable', 422); }
  const teamCards: CardData[] = [];
  for (const m of team.members) {
    const tc = await getCard(d.db, m.key, d.fetchJson, d.now());
    if (!tc) { return fail('card-unavailable', 422); }
    teamCards.push(tc);
  }
  const teamRow: TeamRow[] = team.members.map(m => ({ key: m.key, xp: m.xp, grade: m.grade ?? null, held: m.held ?? null }));
  await d.db.query(
    `insert into fighters (player_id, card_key, xp, grade, held, quota_pct, updated_at, team) values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (player_id) do update set card_key = excluded.card_key, xp = excluded.xp, grade = excluded.grade, held = excluded.held,
       quota_pct = excluded.quota_pct, updated_at = excluded.updated_at, team = excluded.team`,
    [pid, c.key, c.xp, c.grade ?? null, c.held ?? null, c.quotaPct, iso(d.now()), JSON.stringify(teamRow)]);
  // The XP of every card that fights is part of the save's total, so a made-up team is caught like a made-up fighter.
  const busted = await checkProfile(d, pid, raw, c.xp + team.members.reduce((n, m) => n + m.xp, 0));
  return {
    ok: true, clamped: check.clamped || team.clamped, levelCap: check.cap, busted,
    fighter: fighterView(c.key, c.xp, c.grade, c.held, card), team: team.members.map((m, i) => fighterView(m.key, m.xp, m.grade, m.held, teamCards[i])),
  };
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

interface TeamRow { key: string; xp: number; grade: number | null; held: string | null }
interface FighterRow { player_id: number; card_key: string; xp: number; grade: number | null; held: string | null; quota_pct: number; team: TeamRow[] | null }

const fighterRow = async (d: Deps, pid: number): Promise<FighterRow | undefined> =>
  (await d.db.query<FighterRow>('select player_id, card_key, xp, grade, held, quota_pct, team from fighters where player_id = $1', [pid]))[0];

const teamOf = (row: { team: TeamRow[] | null }): TeamRow[] => (Array.isArray(row.team) ? row.team : []).slice(0, TEAM_EXTRAS);

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

export interface ShowcaseView { cardId: string; image?: string; key: string; name: string; tier: number; rarity?: string; set?: string; grade?: number; value?: number }
export interface MemberView { id: number; login: string; elo: number; wins: number; losses: number; fighter?: FighterView; team: FighterView[]; showcase?: ShowcaseView; you: boolean; busted: boolean; crowns: number; bustVotes?: number; youPardoned?: boolean; left?: number }
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
  const rows = await d.db.query<{ id: number; login: string; busted: boolean; elo: number; wins: number; losses: number; crowns: number; card_key: string | null; xp: number | null; grade: number | null; held: string | null; team: TeamRow[] | null; data: any; sc_key: string | null; sc_grade: number | null; sc_data: any }>(
    `select p.id, p.login, (p.busted and not m.pardoned) as busted, m.elo, m.wins, m.losses, f.card_key, f.xp, f.grade, f.held, f.team, c.data,
            (select count(*)::int from league_seasons s where s.league_id = m.league_id and s.player_id = p.id and s.rank = 1) as crowns,
            sc.card_key as sc_key, sc.grade as sc_grade, c2.data as sc_data
       from members m join players p on p.id = m.player_id
       left join fighters f on f.player_id = p.id
       left join cards c on c.id = split_part(f.card_key, '#', 1)
       left join showcases sc on sc.player_id = p.id
       left join cards c2 on c2.id = split_part(sc.card_key, '#', 1)
      where m.league_id = $1 order by (p.busted and not m.pardoned) asc, m.elo desc, m.wins desc, p.login`, [leagueId]);
  // The cards backing each fighter up, with their data (one query for the whole board).
  const ids = [...new Set(rows.flatMap(r => teamOf(r).map(m => cardIdOf(m.key))))];
  const data = new Map(ids.length ? (await d.db.query<{ id: string; data: CardData }>('select id, data from cards where id = any($1::text[])', [ids])).map(c => [c.id, c.data]) : []);
  return rows.map(r => ({
    id: num(r.id), login: r.login, busted: !!r.busted, elo: num(r.elo), wins: num(r.wins), losses: num(r.losses), crowns: num(r.crowns), you: me !== undefined && num(r.id) === me,
    fighter: r.card_key && r.data ? fighterView(r.card_key, num(r.xp), r.grade, r.held, r.data) : undefined,
    team: r.card_key ? teamOf(r).flatMap(m => { const c = data.get(cardIdOf(m.key)); return c ? [fighterView(m.key, num(m.xp), m.grade, m.held, c)] : []; }) : [],
    // A player flagged BUSTED shows nothing: a vanity card from an edited save would be the point of cheating.
    showcase: !r.busted && r.sc_key && r.sc_data ? showcaseView(r.sc_key, r.sc_grade, r.sc_data) : undefined,
  }));
}

function showcaseView(key: string, grade: number | null, data: { id: string; image?: string; name: string; tier: number; rarity?: string; set?: string; price?: { eur?: number; usd?: number } }): ShowcaseView {
  const base = marketValue({ price: data.price });
  const value = base === undefined ? undefined : Math.round(base * gradeMultiplier(grade ?? undefined) * 100) / 100;
  return { cardId: data.id, image: data.image, key, name: data.name, tier: data.tier, rarity: data.rarity, set: data.set, grade: grade ?? undefined, value };
}

/** The player's showcase card: any card TCGdex knows, with its grade. Only a claim, so it is checked for form and nothing else. */
export async function setShowcase(d: Deps, pid: number, raw: unknown): Promise<Result<{ showcase: ShowcaseView }>> {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (!isCardKey(r.key)) { return fail('invalid-card'); }
  let grade: number | undefined;
  if (r.grade !== undefined && r.grade !== null) {
    grade = Number(r.grade);
    if (!Number.isInteger(grade) || grade < 1 || grade > 10) { return fail('invalid-grade'); }
  }
  const card = await getCard(d.db, r.key, d.fetchJson, d.now());
  if (!card) { return fail('card-unavailable', 422); }
  await d.db.query(
    `insert into showcases (player_id, card_key, grade, updated_at) values ($1, $2, $3, $4)
     on conflict (player_id) do update set card_key = excluded.card_key, grade = excluded.grade, updated_at = excluded.updated_at`,
    [pid, r.key, grade ?? null, iso(d.now())]);
  return { ok: true, showcase: showcaseView(r.key, grade ?? null, card as never) };
}

export async function leagueView(d: Deps, pid: number, leagueId: number):
  Promise<Result<{ league: { id: number; name: string; code: string; mode: LeagueMode }; members: MemberView[]; duels: DuelLine[]; today: { used: number; max: number; perRival: number; resetsAt: string }; pardonNeed: number; season: SeasonView; podium: Podium | null }>> {
  if (!(await isMember(d, leagueId, pid))) { return fail('not-member', 404); }
  await rollSeason(d, leagueId);
  const l = (await d.db.query<{ id: number; name: string; code: string; mode: string }>('select id, name, code, mode from leagues where id = $1', [leagueId]))[0];
  const used = num((await d.db.query<{ n: number }>('select count(*)::int as n from duels where league_id = $1 and challenger = $2 and created_at >= $3', [leagueId, pid, iso(startOfDay(d.now()))]))[0].n);
  const members = await membersOf(d, leagueId, pid);
  // Challenges left today against each rival of this league (the per-rival counter of league_duel_quota).
  const spent = new Map((await d.db.query<{ defender: number; n: number }>(
    'select defender, n from league_duel_quota where league_id = $1 and challenger = $2 and day = $3 and defender <> 0', [leagueId, pid, iso(startOfDay(d.now())).slice(0, 10)])).map(r => [num(r.defender), num(r.n)]));
  for (const m of members) { if (!m.you) { m.left = Math.max(0, DAILY_PER_RIVAL - (spent.get(m.id) ?? 0)); } }
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
    ok: true, league: { id: num(l.id), name: l.name, code: l.code, mode: readMode(l.mode) }, members,
    duels: await recentDuels(d, leagueId, 10, pid), today: { used, max: DAILY_DUELS, perRival: DAILY_PER_RIVAL, resetsAt: iso(startOfDay(d.now()) + DAY) }, pardonNeed: need,
    season: seasonView(d.now()), podium: await podium(d, leagueId),
  };
}

/** For the web page: whoever has the invite code can read the ranking (logins and results only). */
export async function publicLeague(d: Deps, rawCode: string): Promise<Result<{ name: string; mode: LeagueMode; members: Omit<MemberView, 'id' | 'you'>[]; duels: DuelLine[]; season: SeasonView; podium: Podium | null }>> {
  const code = normalizeCode(rawCode);
  const l = code ? (await d.db.query<{ id: number; name: string; mode: string }>('select id, name, mode from leagues where code = $1', [code]))[0] : undefined;
  if (!l) { return fail('unknown-code', 404); }
  await rollSeason(d, num(l.id));
  const members = (await membersOf(d, num(l.id))).map(({ id: _id, you: _you, ...m }) => m);
  return { ok: true, name: l.name, mode: readMode(l.mode), members, duels: await recentDuels(d, num(l.id), 15), season: seasonView(d.now()), podium: await podium(d, num(l.id)) };
}

/* ───── duels ───── */

type Snapshot = Fighter & { cardId: string; image?: string; tier: number; cardKey: string; grade?: number };
/** One 1v1 fight of a team duel: who fought (indexes into each team), the HP each started with and the fight itself. */
export interface TeamLine { a: number; b: number; startHp: { a: number; b: number }; winner: 'a' | 'b'; rounds: number; reason: string; log: BattleEvent[] }
export interface TeamFight { me: Snapshot[]; foe: Snapshot[]; duels: TeamLine[]; aliveA: number; aliveB: number }

/** One side of a duel: the fighter and, in a team league, the two cards backing it up, as they fight and as the replay shows them. */
async function sideOf(d: Deps, pid: number, row: FighterRow, withTeam: boolean, bonus: number): Promise<{ fighters: Fighter[]; snaps: Snapshot[] } | undefined> {
  const entries: TeamRow[] = [{ key: row.card_key, xp: num(row.xp), grade: row.grade, held: row.held }, ...(withTeam ? teamOf(row) : [])];
  const fighters: Fighter[] = [], snaps: Snapshot[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const card = await getCard(d.db, e.key, d.fetchJson, d.now());
    if (!card) { return undefined; }
    const f = makeFighter(i ? `duel:${pid}:${i}` : `duel:${pid}`, card, num(e.xp), { grade: e.grade ?? undefined, tokensBonus: bonus, held: (e.held ?? undefined) as never });
    fighters.push(f);
    snaps.push({ ...f, cardId: card.id, image: card.image, tier: card.tier, cardKey: e.key, grade: e.grade ?? undefined });
  }
  return { fighters, snaps };
}

/** How many cards each side has left at the end of a team duel: every fight knocks out exactly one card. */
const alive = (duels: { winner: 'a' | 'b' }[], sizeA: number, sizeB: number) =>
  ({ aliveA: sizeA - duels.filter(x => x.winner === 'b').length, aliveB: sizeB - duels.filter(x => x.winner === 'a').length });

/**
 * Takes one slot off a daily counter, atomically, and returns the new count — or null when the limit is already reached.
 * A single guarded UPSERT (the conflicting row is locked before the `where` is checked) makes concurrent challenges
 * serialize instead of racing, which counting the duels table did not.
 */
async function reserveDuel(d: Deps, leagueId: number, challenger: number, defender: number, day: string, limit: number): Promise<number | null> {
  const r = await d.db.query<{ n: number }>(
    `insert into league_duel_quota (league_id, challenger, defender, day, n) values ($1, $2, $3, $4, 1)
     on conflict (league_id, challenger, defender, day) do update set n = league_duel_quota.n + 1 where league_duel_quota.n < $5
     returning n`, [leagueId, challenger, defender, day, limit]);
  return r[0] ? num(r[0].n) : null;
}

export async function challenge(d: Deps, pid: number, leagueId: number, rivalId: number): Promise<Result<{
  duelId: number; winner: 'a' | 'b'; won: boolean; rounds: number; reason: string; log: unknown[]; battleVersion: number;
  me: unknown; foe: unknown; rival: string; eloChange: number; elo: number; today: { used: number; max: number }; team?: TeamFight;
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
  // A team league needs a full team on both sides, checked before a slot of the daily limit is spent.
  const teams = readMode((await d.db.query<{ mode: string }>('select mode from leagues where id = $1', [leagueId]))[0]?.mode) === 'team';
  if (teams && teamOf(mine).length < TEAM_EXTRAS) { return fail('no-team'); }
  if (teams && teamOf(theirs).length < TEAM_EXTRAS) { return fail('rival-no-team'); }

  // Reserve a slot before doing any work, atomically (see league_duel_quota; the limits are per league): firing many duels at once can no longer slip past
  // the daily limits. The tighter per-rival counter is taken first; its only possible over-count is against a rival who
  // is already capped for the day, which changes nothing.
  const dayKey = iso(startOfDay(d.now())).slice(0, 10);
  if (await reserveDuel(d, leagueId, pid, rivalId, dayKey, DAILY_PER_RIVAL) === null) { return fail('rival-limit', 429); }
  const dayN = await reserveDuel(d, leagueId, pid, 0, dayKey, DAILY_DUELS);
  if (dayN === null) { return fail('daily-limit', 429); }

  const qa = num(mine.quota_pct), qb = num(theirs.quota_pct);
  const sa = await sideOf(d, pid, mine, teams, tokensBonus(qa, qb));
  const sb = await sideOf(d, rivalId, theirs, teams, tokensBonus(qb, qa));
  if (!sa || !sb) { return fail('card-unavailable', 503); }
  const seed = Math.floor(d.rng() * 0xffffffff);
  // One card each: a single fight. A team each: the series of 1v1 fights of team.ts, where the winner keeps its HP.
  let winner: 'a' | 'b', rounds: number, reason: string, log: unknown[], version = BATTLE_VERSION, team: TeamFight | undefined;
  if (teams) {
    const t = simulateTeam(sa.fighters, sb.fighters, seed);
    const duels: TeamLine[] = t.duels.map(x => ({ a: x.a, b: x.b, startHp: x.startHp, winner: x.result.winner, rounds: x.result.rounds, reason: x.result.reason, log: x.result.log }));
    team = { me: sa.snaps, foe: sb.snaps, duels, aliveA: t.aliveA, aliveB: t.aliveB };
    winner = t.winner; rounds = duels.reduce((n, x) => n + x.rounds, 0); reason = duels[duels.length - 1].reason; log = duels;
  } else {
    const result = simulate(sa.fighters[0], sb.fighters[0], seed);
    winner = result.winner; rounds = result.rounds; reason = result.reason; log = result.log; version = result.version;
  }
  const won = winner === 'a';

  const elos = await d.db.query<{ player_id: number; elo: number }>('select player_id, elo from members where league_id = $1 and player_id in ($2, $3)', [leagueId, pid, rivalId]);
  const eloOf = (id: number) => num(elos.find(e => num(e.player_id) === id)!.elo);
  const delta = eloDelta(eloOf(pid), eloOf(rivalId), won);
  await d.db.query('update members set elo = elo + $1, wins = wins + $2, losses = losses + $3 where league_id = $4 and player_id = $5', [delta, won ? 1 : 0, won ? 0 : 1, leagueId, pid]);
  await d.db.query('update members set elo = elo - $1, wins = wins + $2, losses = losses + $3 where league_id = $4 and player_id = $5', [delta, won ? 0 : 1, won ? 1 : 0, leagueId, rivalId]);

  const row = await d.db.query<{ id: number }>(
    `insert into duels (league_id, challenger, defender, seed, battle_version, a, b, winner, elo_change, rounds, log, created_at, team)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
    [leagueId, pid, rivalId, seed, version, JSON.stringify(teams ? { team: sa.snaps } : sa.snaps[0]), JSON.stringify(teams ? { team: sb.snaps } : sb.snaps[0]),
      winner, delta, rounds, JSON.stringify(log), iso(d.now()), teams]);
  const rivalLogin = (await d.db.query<{ login: string }>('select login from players where id = $1', [rivalId]))[0].login;
  return {
    ok: true, duelId: num(row[0].id), winner, won, rounds, reason, log: teams ? [] : log, battleVersion: version,
    me: sa.snaps[0], foe: sb.snaps[0], rival: rivalLogin, eloChange: delta, elo: eloOf(pid) + delta, today: { used: dayN, max: DAILY_DUELS },
    ...(team ? { team } : {}),
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
/** A team duel seen from the defender's corner: the teams swap, and every fight in the series is mirrored like a single duel. */
function mirrorTeam(a: Snapshot[], b: Snapshot[], lines: TeamLine[]): TeamFight {
  const duels = lines.map(x => ({ a: x.b, b: x.a, startHp: { a: x.startHp.b, b: x.startHp.a }, winner: flip(x.winner), rounds: x.rounds, reason: x.reason, log: mirrorLog(x.log) }));
  return { me: b, foe: a, duels, ...alive(duels, b.length, a.length) };
}

/** Duels other players started against you since you last looked. Returned once. */
export async function inbox(d: Deps, pid: number): Promise<Result<{ duels: {
  id: number; league: string; challenger: string; won: boolean; rounds: number; reason: string; log: unknown[]; battleVersion: number;
  me: unknown; foe: unknown; eloChange: number; at: string; team?: TeamFight;
}[] }>> {
  const rows = await d.db.query<{ id: number; league: string; challenger: string; winner: string; rounds: number; log: unknown[]; battle_version: number; a: unknown; b: unknown; elo_change: number; created_at: string; team: boolean }>(
    `select u.id, l.name as league, p.login as challenger, u.winner, u.rounds, u.log, u.battle_version, u.a, u.b, u.elo_change, u.created_at, u.team
       from duels u join leagues l on l.id = u.league_id join players p on p.id = u.challenger
      where u.defender = $1 and not u.seen order by u.id desc limit 20`, [pid]);
  if (rows.length) { await d.db.query('update duels set seen = true where defender = $1 and id = any($2::int[])', [pid, rows.map(r => num(r.id))]); }
  return {
    ok: true,
    duels: rows.map(r => {
      const base = {
        id: num(r.id), league: r.league, challenger: r.challenger, won: r.winner === 'b', rounds: num(r.rounds), reason: (r.log as any[]).at(-1)?.reason ?? 'ko',
        battleVersion: num(r.battle_version), eloChange: -num(r.elo_change), at: new Date(r.created_at).toISOString(),
      };
      if (!r.team) { return { ...base, log: mirrorLog(r.log as BattleEvent[]), me: r.b, foe: r.a }; }
      const team = mirrorTeam((r.a as { team: Snapshot[] }).team, (r.b as { team: Snapshot[] }).team, r.log as TeamLine[]);
      return { ...base, log: [], me: team.me[0], foe: team.foe[0], team };
    }),
  };
}
