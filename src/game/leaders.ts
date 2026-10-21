// The ladder: eight gym leaders with one ace card each, the badges and rewards for beating them, and the battle record.
// Pure (the ace card itself is looked up elsewhere, see Tcgdex.leaderCard). No VS Code, no network.
import { BattleEntry, BattleRecord, Card, GameState, XP_PER_LEVEL, keyOf, levelOf, newBattleRecord } from './engine';
import { Fighter, makeFighter } from './battle';
import { tokensBonus } from './strength';

export interface LeaderDef {
  id: string;
  name: string;
  species: string;      // the ace card, searched by name in TCGdex
  level: number;        // training level of the ace
  demand: number;       // demand class (0-5) of the ace: fixed so the ladder does not drift with market prices
  reward: number;       // coins for the first victory (it also gives the badge)
  rematch: number;      // coins for each later victory (limited per day)
}

/** The Kanto ladder, easiest first. Levels and demand grow so each leader asks a bit more of the player's card. */
export const LEADERS: LeaderDef[] = [
  { id: 'brock', name: 'Brock', species: 'Onix', level: 3, demand: 1, reward: 150, rematch: 3 },
  { id: 'misty', name: 'Misty', species: 'Starmie', level: 9, demand: 1, reward: 200, rematch: 3 },
  { id: 'surge', name: 'Lt. Surge', species: 'Raichu', level: 15, demand: 2, reward: 250, rematch: 3 },
  { id: 'erika', name: 'Erika', species: 'Vileplume', level: 21, demand: 2, reward: 300, rematch: 3 },
  { id: 'koga', name: 'Koga', species: 'Weezing', level: 27, demand: 3, reward: 400, rematch: 3 },
  { id: 'sabrina', name: 'Sabrina', species: 'Alakazam', level: 33, demand: 3, reward: 500, rematch: 3 },
  { id: 'blaine', name: 'Blaine', species: 'Arcanine', level: 39, demand: 4, reward: 700, rematch: 3 },
  { id: 'giovanni', name: 'Giovanni', species: 'Rhydon', level: 45, demand: 4, reward: 1000, rematch: 3 },
];
export const LEADER_BY_ID = Object.fromEntries(LEADERS.map(l => [l.id, l])) as Record<string, LeaderDef>;

/** Rematch victories that still pay out in one day, so the ladder cannot be farmed. */
export const REMATCH_DAILY_CAP = 5;
/** XP the card that fought earns (a victory, a defeat) and how many fights a day give it: about an eighth of a level at most. */
export const WIN_XP = 10_000;
export const LOSS_XP = 4_000;
export const XP_FIGHTS_PER_DAY = 5;
/** Against the leaders the token-usage bonus compares you with a typical player who has used 75% of the quota. */
export const LADDER_REFERENCE_PCT = 75;
export const HISTORY_SIZE = 20;

/** Local calendar day as YYYY-MM-DD (the daily limits reset at midnight, wherever the player is). */
export function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const xpForLevel = (level: number): number => (Math.max(1, level) - 1) * XP_PER_LEVEL;

export const battleOf = (s: GameState): BattleRecord => (s.battle ??= newBattleRecord());

/** A leader can be challenged once the previous one has been beaten (the first one always). */
export function leaderUnlocked(s: GameState, index: number): boolean {
  return index <= 0 || battleOf(s).badges.includes(LEADERS[index - 1].id);
}

export function leaderFighter(def: LeaderDef, card: Card): Fighter {
  return makeFighter(`leader:${def.id}`, card, xpForLevel(def.level), { demandClass: def.demand });
}

export type FighterCheck = { ok: true; fighter: Fighter } | { ok: false; reason: 'none' | 'grading' };

/** Builds the player's fighter from the card they chose: its level, grade and the token-usage bonus. */
export function playerFighter(s: GameState, quotaPct: number): FighterCheck {
  const o = s.fighter ? s.collection[s.fighter] : undefined;
  if (!o || !s.fighter) { return { ok: false, reason: 'none' }; }
  if (o.grading) { return { ok: false, reason: 'grading' }; }
  return { ok: true, fighter: makeFighter(keyOf(o.card), o.card, o.xp, { grade: o.grade, tokensBonus: tokensBonus(quotaPct, LADDER_REFERENCE_PCT), held: o.held }) };
}

/** Chooses the card taken to battles. false if you do not own it. */
export function setFighter(s: GameState, key: string): boolean {
  if (!s.collection[key]) { return false; }
  s.fighter = key;
  return true;
}

export interface BattleOutcome { coins: number; firstWin: boolean; capped: boolean; xp: number; levelUp?: number }

/**
 * Records a finished battle against a leader: record, streak, history, and the reward. The first victory gives the badge
 * and the big reward; later ones give the small one until the daily limit is reached.
 */
export function recordBattle(s: GameState, def: LeaderDef, cardName: string, won: boolean, rounds: number, now = Date.now()): BattleOutcome {
  const b = battleOf(s);
  const today = dayKey(now);
  if (b.daily.day !== today) { b.daily = { day: today, rewarded: 0, xpFights: 0 }; }
  b.daily.xpFights ??= 0;
  let coins = 0, firstWin = false, capped = false;
  if (won) {
    b.wins++; b.streak++; b.best = Math.max(b.best, b.streak);
    if (!b.badges.includes(def.id)) { b.badges.push(def.id); coins = def.reward; firstWin = true; }
    else if (b.daily.rewarded < REMATCH_DAILY_CAP) { coins = def.rematch; b.daily.rewarded++; }
    else { capped = true; }
  } else { b.losses++; b.streak = 0; }
  s.coins += coins;
  // The card that fought learns from it, a little, for the first few fights of the day.
  let xp = 0, levelUp: number | undefined;
  const fighter = s.fighter ? s.collection[s.fighter] : undefined;
  if (fighter && b.daily.xpFights < XP_FIGHTS_PER_DAY) {
    const before = levelOf(fighter.xp);
    xp = won ? WIN_XP : LOSS_XP;
    fighter.xp += xp;
    b.daily.xpFights++;
    if (levelOf(fighter.xp) > before) { levelUp = levelOf(fighter.xp); }
  }
  const entry: BattleEntry = { at: now, leader: def.id, card: cardName, won, rounds, coins };
  b.history = [entry, ...b.history].slice(0, HISTORY_SIZE);
  return { coins, firstWin, capped, xp, ...(levelUp ? { levelUp } : {}) };
}
