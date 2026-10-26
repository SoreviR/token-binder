// Card frames: a purely cosmetic way to spend coins once everything else is bought. They change how cards are drawn in the
// album and never any stat. Pure: no VS Code, no network.
import { GameState } from './engine';
import { halloweenActive } from './halloween';

export interface FrameDef { id: string; price: number; event?: 'halloween' }
/** The ids name the texts (`frame.<id>.name`) and the CSS classes (`.frame-<id>`) of the webview. */
export const FRAMES: FrameDef[] = [
  { id: 'gold', price: 200 },
  { id: 'neon', price: 300 },
  { id: 'flame', price: 400 },
  { id: 'frost', price: 400 },
  { id: 'rainbow', price: 800 },
  { id: 'pumpkin', price: 500, event: 'halloween' },   // only sold during the event; kept forever once bought
];

export const isFrameId = (id: unknown): id is string => typeof id === 'string' && FRAMES.some(f => f.id === id);
export const ownsFrame = (s: GameState, id: string): boolean => !!s.cosmetics?.owned.includes(id);

/** Buys a frame (and puts it on). false if it does not exist, is already yours or you cannot pay. */
export function buyFrame(s: GameState, id: string, now = Date.now()): boolean {
  const def = FRAMES.find(f => f.id === id);
  if (!def || ownsFrame(s, id) || s.coins < def.price || (def.event === 'halloween' && !halloweenActive(now))) { return false; }
  s.coins -= def.price;
  const c = (s.cosmetics ??= { owned: [] });
  c.owned.push(id);
  c.frame = id;
  return true;
}

/** Puts on a frame you own, or takes it off with an empty id. */
export function equipFrame(s: GameState, id: string): boolean {
  if (!id) { if (s.cosmetics) { delete s.cosmetics.frame; } return true; }
  if (!ownsFrame(s, id)) { return false; }
  s.cosmetics!.frame = id;
  return true;
}
