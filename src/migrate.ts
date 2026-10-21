import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { readItemValue } from './usage/sqlite';
import { LEGACY, parseLegacyState } from './legacy';
import { t } from './i18n';

const DONE = 'tokenBinder.migratedFromPokeToken.v1';
const SETTINGS = ['quota.unit', 'quota.monthlyLimit', 'quota.resetDay', 'alerts.thresholds', 'growth.multiplier', 'packs.everyTokens', 'storageRoots'];

/**
 * Copies PokeToken's progress, usage dates and card cache. Synchronous so it runs before the rest starts.
 * Returns what was migrated (empty if there was nothing or it was already done).
 */
export function migrateLegacyState(ctx: vscode.ExtensionContext, log: (s: string) => void): string[] {
  const moved: string[] = [];
  if (ctx.globalState.get(DONE)) { return moved; }
  const storageRoot = path.dirname(ctx.globalStorageUri.fsPath);          // …/User/globalStorage
  try {
    if (!ctx.globalState.get('tokenBinder.game.v2')) {
      const legacy = parseLegacyState(readItemValue(path.join(storageRoot, 'state.vscdb'), LEGACY.extId));
      if (legacy.game) {
        void ctx.globalState.update('tokenBinder.game.v2', legacy.game);
        if (legacy.stamps) { void ctx.globalState.update('tokenBinder.stamps.v1', legacy.stamps); }
        if (legacy.alerts) { void ctx.globalState.update('tokenBinder.alerts.v1', legacy.alerts); }
        moved.push('game progress');
      }
    }
    // Cards and images already downloaded: avoids downloading them again.
    const from = path.join(storageRoot, LEGACY.extId, 'tcg'), to = path.join(ctx.globalStorageUri.fsPath, 'tcg');
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false });
      moved.push('card cache');
    }
    void ctx.globalState.update(DONE, true);
  } catch (e) {
    log(`[migration] will be retried on the next start: ${e}`); // e.g. SQLite not available yet
  }
  if (moved.length) { log(`[migration] recovered from PokeToken: ${moved.join(', ')}`); }
  return moved;
}

/** Copies the user's `pokeToken.*` settings to `tokenBinder.*` (without overwriting ones already set). */
export async function migrateLegacySettings(log: (s: string) => void): Promise<string[]> {
  const old = vscode.workspace.getConfiguration(LEGACY.section);
  const now = vscode.workspace.getConfiguration('tokenBinder');
  const moved: string[] = [];
  for (const key of SETTINGS) {
    const prev = old.inspect(key)?.globalValue ?? old.get(key);
    const def = old.inspect(key)?.defaultValue;
    if (prev === undefined || JSON.stringify(prev) === JSON.stringify(def)) { continue; }   // no value of their own
    if (now.inspect(key)?.globalValue !== undefined) { continue; }                          // already configured
    await now.update(key, prev, vscode.ConfigurationTarget.Global);
    moved.push(key);
  }
  if (moved.length) { log(`[migration] settings copied: ${moved.join(', ')}`); }
  return moved;
}

/** If the old version is still installed, offers to remove it so there are not two identical extensions. */
export async function offerUninstallLegacy(): Promise<void> {
  if (!vscode.extensions.getExtension(LEGACY.extId)) { return; }
  const pick = await vscode.window.showInformationMessage(
    t('legacy.offer'), t('legacy.uninstall'), t('legacy.later'));
  if (pick === t('legacy.uninstall')) {
    await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', LEGACY.extId);
    void vscode.window.showInformationMessage(t('legacy.done'));
  }
}
