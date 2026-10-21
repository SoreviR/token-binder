import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const APP_NAMES = ['Code', 'Code - Insiders', 'VSCodium'];

/** Carpetas «User» de VS Code según el sistema operativo (Windows: %APPDATA%, macOS: Application Support, Linux: ~/.config). */
export function defaultRoots(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string[] {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const base = platform === 'win32' ? env.APPDATA ?? p.join(env.USERPROFILE ?? home, 'AppData', 'Roaming')
    : platform === 'darwin' ? p.join(home, 'Library', 'Application Support')
      : env.XDG_CONFIG_HOME || p.join(home, '.config');
  return APP_NAMES.map(n => p.join(base, n, 'User'));
}

/** Carpeta User de la instalación que ejecuta la extensión (…/User/globalStorage/<ext> → …/User); cubre instalaciones portables. */
export function runningUserRoot(globalStoragePath: string): string {
  return path.dirname(path.dirname(globalStoragePath));
}

/** Quita rutas repetidas (en Windows y macOS sin distinguir mayúsculas, p. ej. `c:\` frente a `C:\`). */
export function uniqueRoots(roots: string[], platform: NodeJS.Platform = process.platform): string[] {
  const seen = new Set<string>();
  return roots.filter(r => {
    const k = (platform === 'linux' ? path.posix : path.win32).normalize(r).replace(/[\\/]+$/, '');
    const key = platform === 'linux' ? k : k.toLowerCase();
    return seen.has(key) ? false : (seen.add(key), true);
  });
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
