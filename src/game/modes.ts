// Extra ways to fight besides the gym ladder: the weekly boss and the daily cup. Pure (the cards are looked up elsewhere,
// see Tcgdex.leaderCard); the rewards and limits live here so they can be tested without VS Code or the network.
import { BattleEntry, GameState, MAX_LEVEL } from './engine';
import { LeaderDef, HISTORY_SIZE, battleOf, dayKey, grantBattleXp, rollDaily } from './leaders';

/* ───────── Weekly boss ───────── */

/** One boss a week, the same for everybody, strong enough to ask for a well trained card. */
const BOSSES: [species: string, level: number, demand: number][] = [
  ['Gyarados', 40, 4], ['Gengar', 42, 4], ['Dragonite', 44, 4], ['Snorlax', 42, 4], ['Tyranitar', 46, 5], ['Blastoise', 44, 4],
  ['Charizard', 46, 5], ['Venusaur', 44, 4], ['Scizor', 46, 4], ['Lugia', 48, 5], ['Garchomp', 48, 5], ['Mewtwo', 50, 5],
];
export const BOSS_ATTEMPTS = 3;
export const BOSS_REWARD = { coins: 400, boxes: 1 };

/** Local Monday of the week as YYYY-MM-DD, and how many weeks since the first Monday of 1970 (the rotation index). */
export function weekOf(now: number): { key: string; index: number } {
  const d = new Date(now);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const days = Math.round(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) / 864e5);
  return { key: dayKey(monday.getTime()), index: Math.round((days - 4) / 7) };
}

export function bossOfWeek(now: number): LeaderDef {
  const [species, level, demand] = BOSSES[((weekOf(now).index % BOSSES.length) + BOSSES.length) % BOSSES.length];
  return { id: 'boss:' + species.toLowerCase(), name: species, species, level: Math.min(MAX_LEVEL, level), demand, reward: BOSS_REWARD.coins, rematch: 0 };
}

export interface BossStatus { def: LeaderDef; attemptsLeft: number; won: boolean }
export function bossStatus(s: GameState, now: number): BossStatus {
  const week = weekOf(now).key;
  const rec = s.boss?.week === week ? s.boss : undefined;
  return { def: bossOfWeek(now), attemptsLeft: Math.max(0, BOSS_ATTEMPTS - (rec?.attempts ?? 0)), won: !!rec?.won };
}

export interface ModeOutcome { coins: number; boxes: number; firstWin: boolean; capped: boolean; xp: number; levelUp?: number }

/** Counts a finished fight in the battle record (wins, streak, history) and gives the card its XP. */
export function recordFight(s: GameState, leader: string, cardName: string, won: boolean, rounds: number, now: number): { xp: number; levelUp?: number } {
  const b = battleOf(s);
  rollDaily(b, now);
  if (won) { b.wins++; b.streak++; b.best = Math.max(b.best, b.streak); } else { b.losses++; b.streak = 0; }
  const xp = grantBattleXp(s, won);
  const entry: BattleEntry = { at: now, leader, card: cardName, won, rounds, coins: 0 };
  b.history = [entry, ...b.history].slice(0, HISTORY_SIZE);
  return xp;
}

/** A fight against this week's boss: costs one of the three attempts; the first victory of the week pays. */
export function recordBossBattle(s: GameState, def: LeaderDef, cardName: string, won: boolean, rounds: number, now = Date.now()): ModeOutcome {
  const week = weekOf(now).key;
  if (s.boss?.week !== week) { s.boss = { week, attempts: 0, won: false }; }
  s.boss.attempts++;
  let coins = 0, boxes = 0, firstWin = false;
  if (won && !s.boss.won) { s.boss.won = true; coins = BOSS_REWARD.coins; boxes = BOSS_REWARD.boxes; firstWin = true; }
  s.coins += coins; s.boxes += boxes;
  const { xp, levelUp } = recordFight(s, def.id, cardName, won, rounds, now);
  return { coins, boxes, firstWin, capped: false, xp, ...(levelUp ? { levelUp } : {}) };
}

/* ───────── Daily cup ───────── */

export const CUP_FEE = 30;
export const CUP_ROUNDS = 3;
/** Coins for winning 0, 1, 2 or 3 rounds in a row; a perfect cup also gives a mystery box. */
export const CUP_PRIZE = [0, 0, 45, 120];
export const CUP_BOX_WINS = CUP_ROUNDS;
const CUP_POOL = ['Pidgeot', 'Machamp', 'Gengar', 'Gyarados', 'Lapras', 'Dragonite', 'Snorlax', 'Alakazam', 'Arcanine', 'Jolteon', 'Vaporeon', 'Flareon', 'Exeggutor', 'Golem', 'Rapidash', 'Nidoking', 'Ninetales', 'Venusaur'];

/** The three rivals of a cup, each a little stronger than the player's card (the last one clearly so). */
export function cupRivals(playerLevel: number, rng: () => number = Math.random): LeaderDef[] {
  const pool = [...CUP_POOL];
  return [-1, 1, 3].map((delta, i) => {
    const species = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    return { id: 'cup:' + species.toLowerCase(), name: species, species, level: Math.max(1, Math.min(MAX_LEVEL, playerLevel + delta)), demand: i + 1, reward: 0, rematch: 0 };
  });
}

export const cupPlayedToday = (s: GameState, now: number): boolean => s.cup?.day === dayKey(now);
export type CupCheck = { ok: true } | { ok: false; reason: 'played' | 'coins' };

/** Pays the entry fee and marks the day. Nothing is charged if the cup cannot be played. */
export function enterCup(s: GameState, now: number): CupCheck {
  if (cupPlayedToday(s, now)) { return { ok: false, reason: 'played' }; }
  if (s.coins < CUP_FEE) { return { ok: false, reason: 'coins' }; }
  s.coins -= CUP_FEE;
  s.cup = { day: dayKey(now) };
  return { ok: true };
}

/** Records one round of the cup in the battle record. */
export function recordCupRound(s: GameState, def: LeaderDef, cardName: string, won: boolean, rounds: number, now = Date.now()): { xp: number; levelUp?: number } {
  return recordFight(s, def.id, cardName, won, rounds, now);
}

/** Pays the cup's prize for the number of rounds won. */
export function finishCup(s: GameState, wins: number): { coins: number; boxes: number } {
  const coins = CUP_PRIZE[Math.max(0, Math.min(CUP_ROUNDS, wins))], boxes = wins >= CUP_BOX_WINS ? 1 : 0;
  s.coins += coins; s.boxes += boxes;
  return { coins, boxes };
}
