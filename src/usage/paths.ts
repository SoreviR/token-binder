import * as fs from 'fs';
import * as path from 'path';

export function defaultRoots(): string[] {
  const appData = process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? '', 'AppData', 'Roaming');
  return ['Code', 'Code - Insiders', 'VSCodium'].map(n => path.join(appData, n, 'User'));
}

function listDir(dir: string): fs.Dirent[] {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

/** session.db del agent host (VS Code reciente): <Code>\agentSessionData\<id>\session.db, junto a la carpeta User. */
export function findAgentDbs(roots: string[]): string[] {
  const out: string[] = [];
  for (const root of roots) {
    const base = path.join(path.dirname(root), 'agentSessionData');
    for (const d of listDir(base)) {
      const db = path.join(base, d.name, 'session.db');
      if (d.isDirectory() && fs.existsSync(db)) { out.push(db); }
    }
  }
  return out;
}

export const hostDbOf = (root: string) => path.join(root, 'globalStorage', 'agent-host.db');

/** Todos los archivos de sesión (.jsonl y .json legado) bajo las raíces User. */
export function findSessionFiles(roots: string[]): string[] {
  const dirs: string[] = [];
  for (const root of roots) {
    for (const ws of listDir(path.join(root, 'workspaceStorage'))) {
      if (ws.isDirectory()) { dirs.push(path.join(root, 'workspaceStorage', ws.name, 'chatSessions')); }
    }
    dirs.push(path.join(root, 'globalStorage', 'emptyWindowChatSessions'));
  }
  const files: string[] = [];
  for (const d of dirs) {
    for (const f of listDir(d)) {
      if (f.isFile() && /\.jsonl?$/.test(f.name)) { files.push(path.join(d, f.name)); }
    }
  }
  return files;
}
