import type * as vscode from 'vscode';
import { GameState, newState, normalize } from './engine';

// v1 was the sprites/eggs game. The card state is independent: nothing is migrated.
const KEY = 'tokenBinder.game.v2';
const ALERTS_KEY = 'tokenBinder.alerts.v1';

export class GameStore {
  constructor(private memento: vscode.Memento) {}

  /** First run: packs are counted from the current lifetime tokens. */
  load(lifetimeNow: number): GameState {
    const saved = this.memento.get<GameState>(KEY);
    return saved?.v === 2 ? normalize(saved, lifetimeNow) : newState(lifetimeNow);
  }
  save(s: GameState): Thenable<void> { return this.memento.update(KEY, s); }

  /** Alert thresholds already announced in the current quota period. */
  alertedFor(periodKey: number): number[] {
    const a = this.memento.get<{ period: number; fired: number[] }>(ALERTS_KEY);
    return a && a.period === periodKey ? a.fired : [];
  }
  markAlerted(periodKey: number, fired: number[]): Thenable<void> {
    return this.memento.update(ALERTS_KEY, { period: periodKey, fired });
  }
}
