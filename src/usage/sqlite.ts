import { spawnSync } from 'child_process';

export interface TurnUsageRow { turnId: string; usage: any }

declare const module: { require(id: string): any };

const QUERY = 'select turn_id as turnId, usage from turn_usage';

// Script para el respaldo: corre con el `node` del PATH (>=22.5) y devuelve solo turn_id + usage como JSON.
const CHILD = `
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1], { readOnly: true });
process.stdout.write(JSON.stringify(db.prepare('${QUERY}').all()));
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

/** Lee turn_usage de un session.db. Devuelve [] si la tabla no existe. Lanza si no hay forma de abrir SQLite. */
export function readTurnUsage(dbPath: string): TurnUsageRow[] {
  const mod = sqliteModule();
  if (mod) {
    lastBackend = 'in-process';
    const db = new mod.DatabaseSync(dbPath, { readOnly: true });
    try { return parse(db.prepare(QUERY).all()); } catch { return []; } finally { db.close(); }
  }
  const r = spawnSync('node', ['--no-warnings', '-e', CHILD, dbPath], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  if (r.error || r.status !== 0) {
    lastBackend = 'none';
    lastError = r.error ? String(r.error.message) : (r.stderr || '').split('\n').find(l => /Error|no such table/.test(l)) ?? 'node falló';
    if (/no such table/.test(r.stderr ?? '')) { return []; }
    throw new Error('SQLite no disponible (ni node:sqlite en VS Code ni `node` >=22.5 en el PATH): ' + lastError);
  }
  lastBackend = 'child-node';
  return parse(JSON.parse(r.stdout || '[]'));
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
