import { spawnSync } from 'child_process';

export interface TurnUsageRow { turnId: string; usage: any }

declare const module: { require(id: string): any };

const QUERY = 'select turn_id as turnId, usage from turn_usage';

// Script for the fallback: runs with Node (>=22.5) and returns turn_id + usage as JSON.
const CHILD = `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1], { readOnly: true });
let rows = [];
try { rows = db.prepare('${QUERY}').all(); } catch {}
process.stdout.write(JSON.stringify(rows));
`;

/**
 * Runs a script with Node and returns its stdout. First with VS Code's own binary (ELECTRON_RUN_AS_NODE), which does
 * not depend on the PATH (on macOS GUI apps do not inherit the terminal's), and if that fails with the PATH's `node`.
 */
function runChild(js: string, args: string[], maxBuffer: number): { ok: true; stdout: string } | { ok: false; error: string } {
  let error = 'node failed';
  const attempts: [string, NodeJS.ProcessEnv][] = [
    [process.execPath, { ...process.env, ELECTRON_RUN_AS_NODE: '1' }],
    ['node', process.env],
  ];
  for (const [bin, env] of attempts) {
    const r = spawnSync(bin, ['--no-warnings', '-e', js, ...args], { encoding: 'utf8', maxBuffer, windowsHide: true, env });
    if (!r.error && r.status === 0) { return { ok: true, stdout: r.stdout }; }
    error = r.error ? String(r.error.message) : (r.stderr || '').split('\n').find(l => /Error/.test(l)) ?? error;
  }
  return { ok: false, error };
}

let inProcess: any | null | undefined;
function sqliteModule(): any | null {
  if (inProcess === undefined) {
    // module.require stops esbuild from trying to resolve 'node:sqlite' when bundling.
    try { inProcess = module.require('node:sqlite'); } catch { inProcess = null; }
  }
  return inProcess;
}

export let lastBackend: 'in-process' | 'child-node' | 'none' = 'none';
export let lastError = '';

function parse(rows: { turnId: string; usage: string }[]): TurnUsageRow[] {
  const out: TurnUsageRow[] = [];
  for (const r of rows) {
    try { out.push({ turnId: r.turnId, usage: JSON.parse(r.usage) }); } catch { /* corrupt row */ }
  }
  return out;
}

/** Reads turn_usage from a session.db. Returns [] if the table does not exist. Throws if SQLite cannot be opened at all. */
export function readTurnUsage(dbPath: string): TurnUsageRow[] {
  const mod = sqliteModule();
  if (mod) {
    lastBackend = 'in-process';
    const db = new mod.DatabaseSync(dbPath, { readOnly: true });
    try { return parse(db.prepare(QUERY).all()); } catch { return []; } finally { db.close(); }
  }
  const r = runChild(CHILD, [dbPath], 256 * 1024 * 1024);
  if (!r.ok) {
    lastBackend = 'none';
    lastError = r.error;
    throw new Error('SQLite not available (neither node:sqlite in VS Code nor `node` >=22.5 on the PATH): ' + lastError);
  }
  lastBackend = 'child-node';
  return parse(JSON.parse(r.stdout || '[]'));
}

/** session_uri → modified_time from agent-host.db (to date the history from before the installation). */
export function readSessionTimes(hostDb: string): Map<string, number> {
  const out = new Map<string, number>();
  try {
    const mod = sqliteModule();
    const sql = 'select session_uri, modified_time from sessions';
    let rows: any[];
    if (mod) {
      const db = new mod.DatabaseSync(hostDb, { readOnly: true });
      try { rows = db.prepare(sql).all(); } finally { db.close(); }
    } else {
      const js = `const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1],{readOnly:true});process.stdout.write(JSON.stringify(d.prepare('${sql}').all()))`;
      const r = runChild(js, [hostDb], 64 * 1024 * 1024);
      rows = r.ok ? JSON.parse(r.stdout) : [];
    }
    for (const r of rows) { out.set(String(r.session_uri).replace(/^.*:\//, ''), Number(r.modified_time)); }
  } catch { /* no dates: the file's mtime is used */ }
  return out;
}

/** Value of a key in the ItemTable of a VS Code state.vscdb (where extensions keep their globalState). */
export function readItemValue(dbPath: string, key: string): string | undefined {
  const sql = 'select value from ItemTable where key = ?';
  const mod = sqliteModule();
  if (mod) {
    const db = new mod.DatabaseSync(dbPath, { readOnly: true });
    try { const r = db.prepare(sql).get(key); return r ? String(r.value) : undefined; } finally { db.close(); }
  }
  const js = `const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1],{readOnly:true});const r=d.prepare('${sql}').get(process.argv[2]);process.stdout.write(JSON.stringify(r?String(r.value):null))`;
  const r = runChild(js, [dbPath, key], 64 * 1024 * 1024);
  if (!r.ok) { throw new Error('SQLite not available to read ' + dbPath); }
  return JSON.parse(r.stdout || 'null') ?? undefined;
}
