// Pure rules of the online league: what a player may register, Elo, daily limits, invite codes and the cheat check. No network, no database.
import { COIN_EVERY_TOKENS, MAX_LEVEL, PACE_BONUS, XP_PER_LEVEL } from '../../src/game/engine';
import { isHeldId } from '../../src/game/items';
import type { HeldId } from '../../src/game/items';

export const ELO_START = 1000;
export const ELO_K = 32;
export const DAILY_DUELS = 10;        // challenges a player can start per day
export const DAILY_PER_RIVAL = 2;     // ... and at most this many against the same rival
export const MAX_OWNED_LEAGUES = 3;
export const MAX_JOINED_LEAGUES = 5;
export const MAX_MEMBERS = 30;
export const SEASON_PODIUM = 3;       // players recorded for each finished season

/** A season is a calendar month (UTC), named like "2026-10". When it ends the ranking is archived and everyone's Elo is pulled halfway back to the start. */
export const seasonOf = (now: number): string => new Date(now).toISOString().slice(0, 7);
export const seasonEnd = (now: number): number => { const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };
export const softElo = (elo: number): number => ELO_START + Math.round((elo - ELO_START) / 2);

/**
 * Speed bump against inflated cards (the server cannot see the player's tokens): a new player may field a card up to this level,
 * and the cap rises each day since they joined. A higher level than allowed is clamped, not refused.
 */
export const BASE_LEVEL_CAP = 10;
export const LEVELS_PER_DAY = 4;

const DAY = 864e5;

export function levelCap(joinedAt: number, now: number): number {
  const days = Math.max(0, Math.floor((now - joinedAt) / DAY));
  return Math.min(MAX_LEVEL, BASE_LEVEL_CAP + LEVELS_PER_DAY * days);
}

/* ───── cheat check: is a reported save impossible for the real time that has passed? ───── */

// Growth even a very active player could not beat in a day. Generous on purpose: this flags an edited save, not a whale.
// The count includes cached tokens (it is the same figure the game progresses on), and a heavy agentic day is mostly cache reads.
export const MAX_TOKENS_PER_DAY = 120_000_000;
const PACKS_EVERY_TOKENS = 750_000;   // the client default (packs.everyTokens); the server cannot read the client setting
const SLOTS_MAX = 6;                   // training slots all earn XP at once, so total XP can grow a few times faster than tokens

/** The whole-save figures the extension reports, so the server can tell an honest save from an edited one. */
export interface Profile { coins: number; cards: number; items: number; xp: number; tokens: number }

/** Reads a profile off the wire, keeping only sane non-negative numbers (anything else becomes 0). */
export function readProfile(raw: unknown): Profile {
  const r = (raw ?? {}) as Record<string, unknown>;
  const n = (x: unknown): number => { const v = Number(x); return Number.isFinite(v) && v > 0 ? v : 0; };
  return { coins: n(r.coins), cards: n(r.cards), items: n(r.items), xp: n(r.xp), tokens: n(r.tokens) };
}

/**
 * Has the save grown beyond what the real time passed since the baseline allows? Only *growth* (report − baseline) is
 * checked, so having less than before (selling, mishaps, a reset) is always fine. The margins are wide, so this catches
 * an edited save (millions of coins, every card maxed, thousands of cards), never a heavy-but-honest player. The one
 * thing the client cannot fake is wall-clock time, so the token growth is anchored to it and the rest to the tokens.
 */
export function isImplausible(p: Profile, base: Profile, msSinceBaseline: number): boolean {
  const days = Math.max(0, msSinceBaseline) / DAY;
  const headroom = MAX_TOKENS_PER_DAY * (days + 1);                   // tokens the player could have used since the baseline
  if (p.tokens - base.tokens > headroom * 2) { return true; }        // more token use than real time allows
  const budget = Math.max(0, p.tokens - base.tokens) + headroom;      // tokens available to explain the rest of the growth
  if (p.coins - base.coins > (budget / COIN_EVERY_TOKENS) * PACE_BONUS * 50 + 1_000_000) { return true; }   // coins come from tokens (and selling), very loosely
  if (p.xp - base.xp > budget * SLOTS_MAX * 1.5 + XP_PER_LEVEL) { return true; }                            // XP is trained with tokens: you cannot train more than you have used
  if (p.cards - base.cards > (budget / PACKS_EVERY_TOKENS) * 8 + 60) { return true; }                       // cards come from packs, which come from tokens
  return false;
}

const NOTHING: Profile = { coins: 0, cards: 0, items: 0, xp: 0, tokens: 0 };

/**
 * The first report has no baseline to grow from, so it is judged against an empty save: the player had at most as many
 * days as their lifetime tokens take at the fastest possible rate. An honest veteran with a long history passes (their
 * lifetime tokens are not "growth"); an edited save with far more coins, cards or XP than those tokens could buy does not.
 */
export function isImplausibleFirst(p: Profile): boolean {
  return isImplausible(p, NOTHING, (p.tokens / MAX_TOKENS_PER_DAY) * DAY);
}

export interface FighterClaim { key: string; xp: number; grade?: number; held?: HeldId; quotaPct: number }
export type ClaimCheck = { ok: true; claim: FighterClaim; clamped: boolean; cap: number } | { ok: false; error: string };

const KEY = /^[\w.-]{1,40}(#(shadowless|first))?$/;
export const isCardKey = (x: unknown): x is string => typeof x === 'string' && KEY.test(x);

/** Validates what the extension says about the player's fighter and clamps what is not plausible. */
export function checkClaim(raw: unknown, joinedAt: number, now: number): ClaimCheck {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r.key !== 'string' || !KEY.test(r.key)) { return { ok: false, error: 'invalid-card' }; }
  const xp = Number(r.xp);
  if (!Number.isFinite(xp) || xp < 0) { return { ok: false, error: 'invalid-xp' }; }
  let grade: number | undefined;
  if (r.grade !== undefined && r.grade !== null) {
    grade = Number(r.grade);
    if (!Number.isInteger(grade) || grade < 1 || grade > 10) { return { ok: false, error: 'invalid-grade' }; }
  }
  let held: HeldId | undefined;
  if (r.held !== undefined && r.held !== null) {
    if (!isHeldId(r.held)) { return { ok: false, error: 'invalid-item' }; }
    held = r.held;
  }
  const quota = Math.round(Number(r.quotaPct ?? 0));
  if (!Number.isFinite(quota)) { return { ok: false, error: 'invalid-quota' }; }
  const cap = levelCap(joinedAt, now);
  const maxXp = (cap - 1) * XP_PER_LEVEL;
  const clamped = xp > maxXp;
  return { ok: true, cap, clamped, claim: { key: r.key, xp: Math.floor(Math.min(xp, maxXp)), grade, held, quotaPct: Math.max(0, Math.min(200, quota)) } };
}

/** Elo change for player A (B gets the opposite). Always at least 1 point, so every duel moves the ranking. */
export function eloDelta(ratingA: number, ratingB: number, aWon: boolean): number {
  const expected = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  const delta = Math.round(ELO_K * ((aWon ? 1 : 0) - expected));
  return aWon ? Math.max(1, delta) : Math.min(-1, delta);
}

// The daily limits (DAILY_DUELS, DAILY_PER_RIVAL) are enforced in service.ts by an atomic counter (duel_quota), not by
// counting rows and then checking: that left a gap a burst of concurrent duels could slip through.

// Letters and digits that cannot be mistaken for each other (no 0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function inviteCode(rng: () => number): string {
  const pick = () => ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return Array.from({ length: 4 }, pick).join('') + '-' + Array.from({ length: 4 }, pick).join('');
}

/** Codes are typed by hand: case, spaces and a missing dash do not matter. */
export function normalizeCode(raw: string): string | undefined {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : undefined;
}

export function cleanLeagueName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') { return undefined; }
  const n = raw.trim().replace(/\s+/g, ' ');
  return n.length >= 2 && n.length <= 40 ? n : undefined;
}
