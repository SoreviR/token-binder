// Extension point for private testing tools. In the public source it does nothing: a local, git-ignored
// `src/devhook.local.ts` replaces this module in local (non-release) builds only. See esbuild.mjs.
import type * as vscode from 'vscode';
import type { GameState } from './game/engine';
import type { MishapResult } from './game/mishaps';

export interface DevContext {
  ctx: vscode.ExtensionContext;
  getState(): GameState | undefined;
  lifetime(): number;
  growth(): number;
  save(): Thenable<void>;
  refresh(): Promise<void>;
  announceMishap(m: MishapResult): void;
}

export function registerDevTools(_dev: DevContext): void { /* intentionally empty */ }
