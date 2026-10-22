// Long-term goals (the "Goals" tab): each one watches a number in the save and pays a reward the first time it is reached.
// Pure: no VS Code, no network. `checkGoals` is called after every refresh.
import { GameState, levelOf } from './engine';

export interface Reward { coins?: number; boxes?: number; packs?: number }
export interface GoalDef { id: string; goal: number; reward: Reward; value: (s: GameState) => number }

const cards = (s: GameState) => Object.values(s.collection);
const best = (s: GameState) => cards(s).reduce((m, o) => Math.max(m, levelOf(o.xp)), 1);

/** Ordered by area; the ids name the texts in the webview dictionaries (`goal.<id>.name` / `.desc`). */
export const GOALS: GoalDef[] = [
  { id: 'collect10', goal: 10, reward: { coins: 20 }, value: s => cards(s).length },
  { id: 'collect50', goal: 50, reward: { coins: 60 }, value: s => cards(s).length },
  { id: 'collect150', goal: 150, reward: { boxes: 1 }, value: s => cards(s).length },
  { id: 'types', goal: 11, reward: { boxes: 1 }, value: s => new Set(cards(s).flatMap(o => o.card.types ?? [])).size },
  { id: 'rare', goal: 1, reward: { coins: 40 }, value: s => cards(s).filter(o => o.card.tier >= 5).length },
  { id: 'legend', goal: 1, reward: { boxes: 1 }, value: s => cards(s).filter(o => o.card.tier >= 6).length },
  { id: 'wins1', goal: 1, reward: { coins: 10 }, value: s => s.battle?.wins ?? 0 },
  { id: 'wins10', goal: 10, reward: { coins: 40 }, value: s => s.battle?.wins ?? 0 },
  { id: 'wins50', goal: 50, reward: { boxes: 1 }, value: s => s.battle?.wins ?? 0 },
  { id: 'streak5', goal: 5, reward: { coins: 30 }, value: s => s.battle?.best ?? 0 },
  { id: 'badges', goal: 8, reward: { packs: 2 }, value: s => s.battle?.badges.length ?? 0 },
  { id: 'lines1', goal: 1, reward: { coins: 30 }, value: s => s.mastered },
  { id: 'lines5', goal: 5, reward: { boxes: 1 }, value: s => s.mastered },
  { id: 'lines20', goal: 20, reward: { packs: 3 }, value: s => s.mastered },
  { id: 'level20', goal: 20, reward: { coins: 30 }, value: best },
  { id: 'level50', goal: 50, reward: { boxes: 1 }, value: best },
  { id: 'graded1', goal: 1, reward: { coins: 30 }, value: s => cards(s).filter(o => o.grade).length },
  { id: 'graded5', goal: 5, reward: { boxes: 1 }, value: s => cards(s).filter(o => o.grade).length },
  { id: 'perfect', goal: 1, reward: { coins: 100 }, value: s => cards(s).filter(o => o.grade === 10).length },
];

/** Progress of a goal, capped at its target. */
export const progressOf = (s: GameState, g: GoalDef): number => Math.min(g.goal, Math.max(0, g.value(s)));

/**
 * Unlocks the goals that are met, pays their rewards and returns one `goal:<id>` event for each.
 * A save from before goals existed (no `goals` yet) only records what is already met: no rewards, no events.
 */
export function checkGoals(s: GameState, now: number): string[] {
  const grandfather = !s.goals;
  const done = (s.goals ??= {});
  const events: string[] = [];
  for (const g of GOALS) {
    if (done[g.id] || g.value(s) < g.goal) { continue; }
    done[g.id] = now;
    if (grandfather) { continue; }
    s.coins += g.reward.coins ?? 0; s.boxes += g.reward.boxes ?? 0; s.packs += g.reward.packs ?? 0;
    events.push('goal:' + g.id);
  }
  return events;
}
