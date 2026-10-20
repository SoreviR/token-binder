import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { readItemValue } from './usage/sqlite';
import { LEGACY, parseLegacyState } from './legacy';

const DONE = 'tokenBinder.migratedFromPokeToken.v1';
const SETTINGS = ['quota.unit', 'quota.monthlyLimit', 'quota.resetDay', 'alerts.thresholds', 'growth.multiplier', 'packs.everyTokens', 'storageRoots'];

/**
 * Copia el progreso, las fechas de uso y la caché de cartas de PokeToken. Síncrona para ejecutarse antes de que
 * arranque el resto. Devuelve qué se migró (vacío si no había nada o ya estaba hecho).
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
        moved.push('progreso del juego');
      }
    }
    // Cartas e imágenes ya descargadas: evita volver a bajarlas.
    const from = path.join(storageRoot, LEGACY.extId, 'tcg'), to = path.join(ctx.globalStorageUri.fsPath, 'tcg');
    if (fs.existsSync(from) && !fs.existsSync(to)) {
      fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false });
      moved.push('caché de cartas');
    }
    void ctx.globalState.update(DONE, true);
  } catch (e) {
    log(`[migración] se reintentará en el próximo arranque: ${e}`); // p. ej. sin SQLite disponible todavía
  }
  if (moved.length) { log(`[migración] recuperado de PokeToken: ${moved.join(', ')}`); }
  return moved;
}

/** Copia los ajustes `pokeToken.*` del usuario a `tokenBinder.*` (sin pisar los que ya haya puesto). */
export async function migrateLegacySettings(log: (s: string) => void): Promise<string[]> {
  const old = vscode.workspace.getConfiguration(LEGACY.section);
  const now = vscode.workspace.getConfiguration('tokenBinder');
  const moved: string[] = [];
  for (const key of SETTINGS) {
    const prev = old.inspect(key)?.globalValue ?? old.get(key);
    const def = old.inspect(key)?.defaultValue;
    if (prev === undefined || JSON.stringify(prev) === JSON.stringify(def)) { continue; }   // sin valor propio
    if (now.inspect(key)?.globalValue !== undefined) { continue; }                          // ya configurado
    await now.update(key, prev, vscode.ConfigurationTarget.Global);
    moved.push(key);
  }
  if (moved.length) { log(`[migración] ajustes copiados: ${moved.join(', ')}`); }
  return moved;
}

/** Si la versión antigua sigue instalada, ofrece quitarla para no tener dos extensiones iguales. */
export async function offerUninstallLegacy(): Promise<void> {
  if (!vscode.extensions.getExtension(LEGACY.extId)) { return; }
  const pick = await vscode.window.showInformationMessage(
    'TokenBinder reemplaza a PokeToken (misma extensión con otro nombre). Ya recuperé tu progreso y tus ajustes. ¿Desinstalar la versión antigua para evitar duplicados?',
    'Desinstalar PokeToken', 'Más tarde');
  if (pick === 'Desinstalar PokeToken') {
    await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', LEGACY.extId);
    void vscode.window.showInformationMessage('PokeToken desinstalada. Reinicia VS Code para terminar.');
  }
}
