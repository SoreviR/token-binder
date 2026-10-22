// The showcase: the one card a player shows off in their leagues. They can pin any card of their album; without a pin it is
// the most valuable one (market value x grade x condition). Pure: no VS Code, no network.
import type { GameState, Owned } from './engine';
import { conditionMultiplier, gradeMultiplier } from './grading';
import { marketValue } from './market';

/** How much a card is worth for choosing the showcase: its market value as graded and worn, or 0 when it has no price. */
export const showcaseScore = (o: Owned): number => (marketValue(o.card) ?? 0) * gradeMultiplier(o.grade) * conditionMultiplier(o.wear, o.grade, o.soaked);

/** The key of the card to show: the pinned one if you still have it and it is dry, otherwise the most valuable (then the rarest). */
export function showcaseKey(s: GameState): string | undefined {
  const pinned = s.showcase ? s.collection[s.showcase] : undefined;
  if (s.showcase && pinned && !pinned.soaked) { return s.showcase; }
  let best: [string, Owned] | undefined;
  for (const entry of Object.entries(s.collection)) {
    const [, o] = entry;
    if (o.soaked) { continue; }
    if (!best || showcaseScore(o) > showcaseScore(best[1]) || (showcaseScore(o) === showcaseScore(best[1]) && o.card.tier > best[1].card.tier)) { best = entry; }
  }
  return best?.[0];
}

/** Pins a card you own and that is dry. */
export function pinShowcase(s: GameState, key: string): boolean {
  const o = s.collection[key];
  if (!o || o.soaked) { return false; }
  s.showcase = key;
  return true;
}

export function clearShowcase(s: GameState): void { delete s.showcase; }
