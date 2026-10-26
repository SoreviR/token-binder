// Halloween event (temporary): a spooky pack, a boss with its own arena and a pumpkin frame. It switches itself on and off by
// the local date, so it ends even for players who never update. Everything about it lives here, in the `hw.*` texts and in the
// `ev-halloween` CSS block. Pure: no VS Code, no network.
import { GameState } from './engine';
import { LeaderDef, dayKey } from './leaders';
import { ModeOutcome, recordFight } from './modes';

/** First day and the day after the last one (local dates). */
export const HALLOWEEN = { start: '2026-10-26', end: '2026-11-04' };
export const halloweenActive = (now: number): boolean => { const d = dayKey(now); return d >= HALLOWEEN.start && d < HALLOWEEN.end; };

/** Species the spooky pack draws from (two cards a pack). */
export const SPOOKY = ['Gastly', 'Haunter', 'Gengar', 'Misdreavus', 'Mismagius', 'Duskull', 'Dusclops', 'Dusknoir', 'Shuppet', 'Banette', 'Sableye',
  'Spiritomb', 'Drifloon', 'Drifblim', 'Litwick', 'Lampent', 'Chandelure', 'Pumpkaboo', 'Gourgeist', 'Phantump', 'Trevenant', 'Mimikyu', 'Sinistea',
  'Polteageist', 'Dreepy', 'Drakloak', 'Dragapult', 'Yamask', 'Cofagrigus', 'Murkrow', 'Honchkrow', 'Houndoom', 'Zorua', 'Zoroark', 'Greavard', 'Houndstone'];
export const SPOOKY_CARDS = 2;

export const HW_BOSS: LeaderDef = { id: 'hw:gourgeist', name: 'Gourgeist', species: 'Gourgeist', level: 44, demand: 4, reward: 666, rematch: 0 };
export const HW_ATTEMPTS = 3;
export const HW_REWARD = { coins: 666, boxes: 2, spooky: 1 };

/** One free spooky pack the first time the event is seen. Returns whether it was given. */
export function grantHwGift(s: GameState, now: number): boolean {
  if (!halloweenActive(now) || s.hw?.gift) { return false; }
  s.hw = { won: false, day: '', attempts: 0, ...s.hw, gift: true };
  s.spooky = (s.spooky ?? 0) + 1;
  return true;
}

export interface HwStatus { attemptsLeft: number; won: boolean }
export function hwStatus(s: GameState, now: number): HwStatus {
  const today = s.hw?.day === dayKey(now);
  return { attemptsLeft: Math.max(0, HW_ATTEMPTS - (today ? s.hw!.attempts : 0)), won: !!s.hw?.won };
}

/** A fight against the Halloween boss: three attempts a day; the first victory of the event pays. */
export function recordHwBattle(s: GameState, cardName: string, won: boolean, rounds: number, now = Date.now()): ModeOutcome & { spooky: number } {
  const day = dayKey(now);
  const hw = (s.hw ??= { day, attempts: 0 });
  if (hw.day !== day) { hw.day = day; hw.attempts = 0; }
  hw.attempts++;
  let coins = 0, boxes = 0, spooky = 0, firstWin = false;
  if (won && !hw.won) { hw.won = true; coins = HW_REWARD.coins; boxes = HW_REWARD.boxes; spooky = HW_REWARD.spooky; firstWin = true; }
  s.coins += coins; s.boxes += boxes; s.spooky = (s.spooky ?? 0) + spooky;
  const { xp, levelUp } = recordFight(s, HW_BOSS.id, cardName, won, rounds, now);
  return { coins, boxes, spooky, firstWin, capped: false, xp, ...(levelUp ? { levelUp } : {}) };
}
