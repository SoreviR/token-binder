// The Elite Four: the endgame ladder. Four trainers with a team of three cards each; you need every gym badge to start and each one
// unlocks the next. Fought with your team (see team.ts). Pure: the cards themselves are looked up elsewhere (Tcgdex.leaderCard).
import { BattleEntry, GameState, MAX_LEVEL } from './engine';
import { HISTORY_SIZE, LEADERS, battleOf, dayKey, grantBattleXp, rollDaily } from './leaders';
import type { LeaderDef } from './leaders';

export interface TrainerDef {
  id: string;
  name: string;
  cards: [species: string, level: number, demand: number][];   // weakest first
  reward: { coins: number; boxes: number };   // first victory
}

export const ELITE: TrainerDef[] = [
  { id: 'lorelei', name: 'Lorelei', cards: [['Dewgong', 34, 3], ['Cloyster', 36, 3], ['Lapras', 38, 4]], reward: { coins: 1200, boxes: 1 } },
  { id: 'bruno', name: 'Bruno', cards: [['Onix', 38, 3], ['Hitmonlee', 40, 4], ['Machamp', 42, 4]], reward: { coins: 1500, boxes: 1 } },
  { id: 'agatha', name: 'Agatha', cards: [['Golbat', 38, 3], ['Arbok', 41, 3], ['Gengar', 44, 4]], reward: { coins: 1800, boxes: 2 } },
  { id: 'lance', name: 'Lance', cards: [['Gyarados', 42, 4], ['Dragonair', 44, 4], ['Dragonite', 48, 5]], reward: { coins: 2500, boxes: 3 } },
];
export const ELITE_BY_ID = Object.fromEntries(ELITE.map(e => [e.id, e])) as Record<string, TrainerDef>;
/** Coins for beating a trainer again, and how many such rematches pay per day. */
export const ELITE_REMATCH = 10;
export const ELITE_REMATCH_DAILY = 3;

/** The trainer's cards as leaders (for the card lookup and the fighter), each with its own id so it is remembered. */
export function eliteCards(t: TrainerDef): LeaderDef[] {
  return t.cards.map(([species, level, demand], i) => ({ id: `elite:${t.id}:${i}`, name: species, species, level: Math.min(MAX_LEVEL, level), demand, reward: 0, rematch: 0 }));
}

export const eliteBeaten = (s: GameState): string[] => (s.elite ??= { beaten: [], daily: { day: '', n: 0 } }).beaten;

/** Every gym badge opens the first trainer; each one then opens the next. */
export function eliteUnlocked(s: GameState, index: number): boolean {
  if (!LEADERS.every(l => battleOf(s).badges.includes(l.id))) { return false; }
  return index <= 0 || eliteBeaten(s).includes(ELITE[index - 1].id);
}

export interface EliteOutcome { coins: number; boxes: number; firstWin: boolean; capped: boolean; xp: number; levelUp?: number }

/**
 * Records a finished Elite fight: record, history and the reward (the big one the first time, a small one for a few rematches a day).
 * The card that led earns the usual battle XP.
 */
export function recordEliteBattle(s: GameState, t: TrainerDef, cardName: string, won: boolean, duels: number, now = Date.now()): EliteOutcome {
  const b = battleOf(s);
  rollDaily(b, now);
  const e = (s.elite ??= { beaten: [], daily: { day: '', n: 0 } });
  const today = dayKey(now);
  if (e.daily.day !== today) { e.daily = { day: today, n: 0 }; }
  let coins = 0, boxes = 0, firstWin = false, capped = false;
  if (won) {
    b.wins++; b.streak++; b.best = Math.max(b.best, b.streak);
    if (!e.beaten.includes(t.id)) { e.beaten.push(t.id); coins = t.reward.coins; boxes = t.reward.boxes; firstWin = true; }
    else if (e.daily.n < ELITE_REMATCH_DAILY) { coins = ELITE_REMATCH; e.daily.n++; }
    else { capped = true; }
  } else { b.losses++; b.streak = 0; }
  s.coins += coins; s.boxes += boxes;
  const { xp, levelUp } = grantBattleXp(s, won);
  const entry: BattleEntry = { at: now, leader: 'elite:' + t.id, card: cardName, won, rounds: duels, coins };
  b.history = [entry, ...b.history].slice(0, HISTORY_SIZE);
  return { coins, boxes, firstWin, capped, xp, ...(levelUp ? { levelUp } : {}) };
}

