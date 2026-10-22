// Pure rules of the online league: what a player may register, Elo, daily limits and invite codes. No network, no database.
import { MAX_LEVEL, XP_PER_LEVEL } from '../../src/game/engine';
import { isHeldId } from '../../src/game/items';
import type { HeldId } from '../../src/game/items';

export const ELO_START = 1000;
export const ELO_K = 32;
export const DAILY_DUELS = 10;        // challenges a player can start per day
export const DAILY_PER_RIVAL = 2;     // ... and at most this many against the same rival
export const MAX_OWNED_LEAGUES = 3;
export const MAX_JOINED_LEAGUES = 5;
export const MAX_MEMBERS = 30;

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

export interface FighterClaim { key: string; xp: number; grade?: number; held?: HeldId; quotaPct: number }
export type ClaimCheck = { ok: true; claim: FighterClaim; clamped: boolean; cap: number } | { ok: false; error: string };

const KEY = /^[\w.-]{1,40}(#(shadowless|first))?$/;

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
