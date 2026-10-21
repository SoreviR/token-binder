// Progress export format and automatic backups made when the extension version changes. No VS Code dependency
// (the Memento is passed in as a minimal interface) so it can be tested.
import * as fs from 'fs';
import * as path from 'path';
import { GameState, STATE_SCHEMA } from './engine';

export const EXPORT_APP = 'token-binder';
const GAME_KEY = 'tokenBinder.game.v2';
const LAST_VERSION_KEY = 'tokenBinder.lastVersion';
const KEEP_BACKUPS = 3;

export interface ExportFile { app: string; exportedAt: string; schema: number; extensionVersion: string; game: GameState }

/** The file written by "Export progress" and by the automatic backups. */
export function exportPayload(game: GameState, extensionVersion: string, now = new Date()): ExportFile {
  return { app: EXPORT_APP, exportedAt: now.toISOString(), schema: STATE_SCHEMA, extensionVersion, game };
}

export type ParsedImport = { ok: true; game: GameState } | { ok: false; reason: 'format' | 'tooNew' };

/**
 * Validates an exported file. Files from before `schema` existed are accepted (they go through `normalize()`);
 * files from a newer schema than this version understands are refused so nothing is silently lost.
 */
export function parseImport(data: any): ParsedImport {
  const g = data?.game;
  if (data?.app !== EXPORT_APP || g?.v !== 2 || typeof g.collection !== 'object' || g.collection === null || !Array.isArray(g.slots)) {
    return { ok: false, reason: 'format' };
  }
  if (typeof data.schema === 'number' && data.schema > STATE_SCHEMA) { return { ok: false, reason: 'tooNew' }; }
  return { ok: true, game: g as GameState };
}

/** Minimal slice of vscode.Memento. */
export interface MementoLike { get<T>(key: string): T | undefined; update(key: string, value: unknown): Thenable<void> }

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');   // 20261021T153000Z: sorts as text
export const backupName = (previousVersion: string | undefined, now: Date) => `progress-${previousVersion ?? 'earlier'}-${stamp(now)}.json`;

const dateOf = (name: string) => /(\d{8}T\d{6}Z)\.json$/.exec(name)![1];

/** Backup files to delete so that only the newest `keep` remain. */
export function backupsToPrune(names: string[], keep = KEEP_BACKUPS): string[] {
  const mine = names.filter(n => /^progress-.+-\d{8}T\d{6}Z\.json$/.test(n));
  const newestFirst = mine.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  return newestFirst.slice(keep);
}

/**
 * When the extension version differs from the last one that ran, copies the saved progress to `dir` (before the new
 * version touches it) and remembers the version. Returns the backup path, or undefined if nothing was backed up.
 */
export async function backupIfUpgraded(memento: MementoLike, currentVersion: string, dir: string, now = new Date()): Promise<string | undefined> {
  const previous = memento.get<string>(LAST_VERSION_KEY);
  if (previous === currentVersion) { return undefined; }
  const saved = memento.get<GameState>(GAME_KEY);
  let file: string | undefined;
  if (saved && saved.v === 2) {
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, backupName(previous, now));
    fs.writeFileSync(file, JSON.stringify(exportPayload(saved, previous ?? 'unknown', now)));
    for (const old of backupsToPrune(fs.readdirSync(dir))) { try { fs.unlinkSync(path.join(dir, old)); } catch { /* already gone */ } }
  }
  await memento.update(LAST_VERSION_KEY, currentVersion);
  return file;
}
