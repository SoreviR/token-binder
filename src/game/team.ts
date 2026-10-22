// Teams of three: your battle card leads and up to two more cards back it up. A team fight is a series of 1v1 fights
// (see battle.ts) where the winner keeps the HP it has left and the loser is replaced by the next card. Pure: no VS Code, no network.
import type { GameState } from './engine';
import { BattleResult, Fighter, simulate } from './battle';

export const TEAM_EXTRAS = 2;          // cards besides the one you take to battle
export const TEAM_SIZE = TEAM_EXTRAS + 1;

/** Can this card stand in the team? It must be owned, dry and not out for grading. */
export function canJoinTeam(s: GameState, key: string): boolean {
  const o = s.collection[key];
  return !!o && !o.soaked && !o.grading && key !== s.fighter;
}

/** Adds a card to the team. false if it cannot join, is already in it or the team is full. */
export function addToTeam(s: GameState, key: string): boolean {
  const team = (s.team = (s.team ?? []).filter(k => canJoinTeam(s, k)));   // forget members that can no longer fight before counting
  if (!canJoinTeam(s, key) || team.includes(key) || team.length >= TEAM_EXTRAS) { return false; }
  team.push(key);
  return true;
}

export function removeFromTeam(s: GameState, key: string): boolean {
  const i = s.team?.indexOf(key) ?? -1;
  if (i < 0) { return false; }
  s.team!.splice(i, 1);
  return true;
}

/** The keys that would fight, lead first: the battle card then the team, dropping any card that can no longer fight. */
export function teamKeys(s: GameState): string[] {
  if (!s.fighter) { return []; }
  const lead = s.collection[s.fighter];
  if (!lead || lead.soaked || lead.grading) { return []; }
  const extras = (s.team ?? []).filter((k, i, all) => canJoinTeam(s, k) && all.indexOf(k) === i).slice(0, TEAM_EXTRAS);
  return [s.fighter, ...extras];
}

export interface TeamDuel {
  a: number; b: number;                 // who fought: indexes into each team
  result: BattleResult;
  startHp: { a: number; b: number };    // what each had when this duel began (carried over from the previous one)
}
export interface TeamResult { winner: 'a' | 'b'; duels: TeamDuel[]; left: { a: number; b: number }; aliveA: number; aliveB: number }

/**
 * Plays two teams against each other. In each duel the winner keeps the HP it has left (a card that wins by timeout is
 * not healed) and the loser is replaced by the next card at full HP. Every duel has its own seed derived from `seed`.
 */
export function simulateTeam(a: Fighter[], b: Fighter[], seed: number): TeamResult {
  let ia = 0, ib = 0, hpA = a[0].hp, hpB = b[0].hp;
  const duels: TeamDuel[] = [];
  while (ia < a.length && ib < b.length) {
    const startHp = { a: hpA, b: hpB };
    const result = simulate(a[ia], b[ib], seed + duels.length * 7919, startHp);
    duels.push({ a: ia, b: ib, result, startHp });
    if (result.winner === 'a') { hpA = result.hpLeft.a; ib++; hpB = b[ib]?.hp ?? 0; }
    else { hpB = result.hpLeft.b; ia++; hpA = a[ia]?.hp ?? 0; }
  }
  const winner = ib >= b.length ? 'a' : 'b';
  return { winner, duels, left: { a: winner === 'a' ? hpA : 0, b: winner === 'b' ? hpB : 0 }, aliveA: Math.max(0, a.length - ia), aliveB: Math.max(0, b.length - ib) };
}

/** Rough chance (0-1) that team `a` beats team `b`, by replaying the whole fight with many seeds. */
export function estimateTeamWin(a: Fighter[], b: Fighter[], runs = 60, baseSeed = 11): number {
  let wins = 0;
  for (let i = 0; i < runs; i++) { if (simulateTeam(a, b, baseSeed + i * 104729).winner === 'a') { wins++; } }
  return wins / runs;
}

