import type * as vscode from 'vscode';
import { GameState, spawn } from './engine';

const KEY = 'pokeToken.game.v1';
const ALERTS_KEY = 'pokeToken.alerts.v1';

export class GameStore {
  constructor(private memento: vscode.Memento) {}

  /** Primera ejecución: el huevo nace con los tokens de por vida actuales, así empieza de cero. */
  load(lifetimeNow: number): GameState {
    const saved = this.memento.get<GameState>(KEY);
    return saved ?? { current: spawn(lifetimeNow), dex: [], candyPeriod: 0, hatchedCount: 0 };
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
