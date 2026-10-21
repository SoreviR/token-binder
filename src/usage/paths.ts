import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const APP_NAMES = ['Code', 'Code - Insiders', 'VSCodium'];

/** VS Code "User" folders per operating system (Windows: %APPDATA%, macOS: Application Support, Linux: ~/.config). */
export function defaultRoots(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string[] {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const base = platform === 'win32' ? env.APPDATA ?? p.join(env.USERPROFILE ?? home, 'AppData', 'Roaming')
    : platform === 'darwin' ? p.join(home, 'Library', 'Application Support')
      : env.XDG_CONFIG_HOME || p.join(home, '.config');
  return APP_NAMES.map(n => p.join(base, n, 'User'));
}

/** User folder of the installation running the extension (…/User/globalStorage/<ext> → …/User); covers portable installs. */
export function runningUserRoot(globalStoragePath: string): string {
  return path.dirname(path.dirname(globalStoragePath));
}

/** Removes duplicate paths (case-insensitive on Windows and macOS, e.g. `c:\` vs `C:\`). */
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

/** The agent host's session.db (recent VS Code): <Code>\agentSessionData\<id>\session.db, next to the User folder. */
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

/** All session files (.jsonl and legacy .json) under the User roots. */
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
