// "Since last time": what happened while the player was busy, kept until they dismiss it. Pure, fed with the events of each refresh.
import { GameState } from './engine';

export interface Recap { since: number; coins0: number; ev: string[] }
export interface RecapView { since: number; coins: number; packs: number; levels: string[]; evolved: string[]; graduated: string[]; graded: number; goals: string[] }

const KEPT = /^(packs:|bonusPack$|evolve:|graduate:|level:|graded:|goal:)/;
const MAX_EVENTS = 80;

/** Remembers the events worth reporting (starting a recap if there is none). */
export function noteRecap(s: GameState, events: string[], now: number): void {
  const kept = events.filter(e => KEPT.test(e));
  if (!kept.length) { return; }
  const r = (s.recap ??= { since: now, coins0: s.coins, ev: [] });
  r.ev.push(...kept);
  if (r.ev.length > MAX_EVENTS) { r.ev.splice(0, r.ev.length - MAX_EVENTS); }
}

export function recapView(s: GameState): RecapView | undefined {
  const r = s.recap;
  if (!r) { return undefined; }
  const v: RecapView = { since: r.since, coins: Math.max(0, Math.floor(s.coins) - Math.floor(r.coins0)), packs: 0, levels: [], evolved: [], graduated: [], graded: 0, goals: [] };
  const top = new Map<string, number>();
  for (const e of r.ev) {
    if (e.startsWith('packs:')) { v.packs += Number(e.slice(6)) || 0; }
    else if (e === 'bonusPack') { v.packs++; }
    else if (e.startsWith('evolve:')) { v.evolved.push(e.slice(7)); }
    else if (e.startsWith('graduate:')) { v.graduated.push(e.slice(9)); }
    else if (e.startsWith('graded:')) { v.graded++; }
    else if (e.startsWith('goal:')) { v.goals.push(e.slice(5)); }
    else if (e.startsWith('level:')) { const [, name, lv] = e.split(':'); top.set(name, Math.max(top.get(name) ?? 0, Number(lv) || 0)); }
  }
  v.levels = [...top].map(([name, lv]) => `${name} ${lv}`);
  return v;
}
