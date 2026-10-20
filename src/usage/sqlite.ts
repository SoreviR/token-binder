import { spawnSync } from 'child_process';

export interface TurnUsageRow { turnId: string; usage: any }

declare const module: { require(id: string): any };

const QUERY = 'select turn_id as turnId, usage from turn_usage';

/** Modo de la sesión (p. ej. "interactive"): session_metadata › configValues › mode. */
const MODE_QUERY = "select value from session_metadata where key = 'configValues'";

// Script para el respaldo: corre con el `node` del PATH (>=22.5) y devuelve turn_id + usage y el modo como JSON.
const CHILD = `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1], { readOnly: true });
let rows = [], mode;
try { rows = db.prepare('${QUERY}').all(); } catch {}
try { const m = JSON.parse(db.prepare("${MODE_QUERY}").get().value).mode; if (typeof m === 'string') mode = m; } catch {}
process.stdout.write(JSON.stringify({ rows, mode }));
`;

let inProcess: any | null | undefined;
function sqliteModule(): any | null {
  if (inProcess === undefined) {
    // module.require evita que esbuild intente resolver 'node:sqlite' al empaquetar.
    try { inProcess = module.require('node:sqlite'); } catch { inProcess = null; }
  }
  return inProcess;
}

export let lastBackend: 'in-process' | 'child-node' | 'none' = 'none';
export let lastError = '';

function parse(rows: { turnId: string; usage: string }[]): TurnUsageRow[] {
  const out: TurnUsageRow[] = [];
  for (const r of rows) {
    try { out.push({ turnId: r.turnId, usage: JSON.parse(r.usage) }); } catch { /* fila corrupta */ }
  }
  return out;
}

export interface SessionUsage { rows: TurnUsageRow[]; mode?: string }

/** Lee turn_usage y el modo de un session.db. rows=[] si la tabla no existe. Lanza si no hay forma de abrir SQLite. */
export function readTurnUsage(dbPath: string): SessionUsage {
  const mod = sqliteModule();
  if (mod) {
    lastBackend = 'in-process';
    const db = new mod.DatabaseSync(dbPath, { readOnly: true });
    try {
      let rows: TurnUsageRow[] = [], mode: string | undefined;
      try { rows = parse(db.prepare(QUERY).all()); } catch { /* sin tabla turn_usage */ }
      try { const m = JSON.parse(db.prepare(MODE_QUERY).get().value).mode; if (typeof m === 'string') { mode = m; } } catch { /* sin modo */ }
      return { rows, mode };
    } finally { db.close(); }
  }
  const r = spawnSync('node', ['--no-warnings', '-e', CHILD, dbPath], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  if (r.error || r.status !== 0) {
    lastBackend = 'none';
    lastError = r.error ? String(r.error.message) : (r.stderr || '').split('\n').find(l => /Error/.test(l)) ?? 'node falló';
    throw new Error('SQLite no disponible (ni node:sqlite en VS Code ni `node` >=22.5 en el PATH): ' + lastError);
  }
  lastBackend = 'child-node';
  const out = JSON.parse(r.stdout || '{}');
  return { rows: parse(out.rows ?? []), mode: out.mode };
}

/** session_uri → modified_time de agent-host.db (para fechar el histórico previo a la instalación). */
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
      const r = spawnSync('node', ['--no-warnings', '-e', js, hostDb], { encoding: 'utf8', windowsHide: true });
      rows = r.status === 0 ? JSON.parse(r.stdout) : [];
    }
    for (const r of rows) { out.set(String(r.session_uri).replace(/^.*:\//, ''), Number(r.modified_time)); }
  } catch { /* sin fechas: se usa el mtime del archivo */ }
  return out;
}
