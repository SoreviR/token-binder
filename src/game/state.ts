import type * as vscode from 'vscode';
import { GameState, newState, normalize } from './engine';

// v1 era el juego de sprites/huevos. El estado de cartas es independiente: no se migra nada.
const KEY = 'tokenBinder.game.v2';
const ALERTS_KEY = 'tokenBinder.alerts.v1';

export class GameStore {
  constructor(private memento: vscode.Memento) {}

  /** Primera ejecución: los sobres se cuentan desde los tokens de por vida actuales. */
  load(lifetimeNow: number): GameState {
    const saved = this.memento.get<GameState>(KEY);
    return saved?.v === 2 ? normalize(saved, lifetimeNow) : newState(lifetimeNow);
  }
  save(s: GameState): Thenable<void> { return this.memento.update(KEY, s); }

  /** Umbrales de alerta ya avisados en el periodo de cuota vigente. */
  alertedFor(periodKey: number): number[] {
    const a = this.memento.get<{ period: number; fired: number[] }>(ALERTS_KEY);
    return a && a.period === periodKey ? a.fired : [];
  }
  markAlerted(periodKey: number, fired: number[]): Thenable<void> {
    return this.memento.update(ALERTS_KEY, { period: periodKey, fired });
  }
}
