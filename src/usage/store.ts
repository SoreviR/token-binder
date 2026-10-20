import * as fs from 'fs';
import * as path from 'path';
import { parseSessionFile } from './journal';
import { extractSession, extractTurnUsage, UsageRecord } from './extract';
import { findAgentDbs, findSessionFiles, hostDbOf } from './paths';
import { readSessionTimes, readTurnUsage } from './sqlite';

interface FileEntry { mtime: number; size: number; records: UsageRecord[] }

/** Fechas de primera aparición de cada turno (persistidas por la extensión). */
export interface Stamps { baselined: boolean; firstSeen: Record<string, number> }

const statSig = (f: string): { mtime: number; size: number } => {
  let mtime = 0, size = 0;
  for (const p of [f, f + '-wal']) { // SQLite en modo WAL escribe primero en -wal
    try { const s = fs.statSync(p); mtime = Math.max(mtime, s.mtimeMs); size += s.size; } catch { /* no existe */ }
  }
  return { mtime, size };
};

export interface Bucket { input: number; cached: number; output: number; credits: number }
const empty = (): Bucket => ({ input: 0, cached: 0, output: 0, credits: 0 });
export const totalOf = (b: Bucket) => b.input + b.cached + b.output;

export interface Aggregate {
  month: Bucket; today: Bucket;
  byModel: Record<string, Bucket>;
  daily: { date: string; total: number; credits: number }[];
}

export class UsageStore {
  private files = new Map<string, FileEntry>();
  stamps: Stamps = { baselined: false, firstSeen: {} };
  stampsDirty = false;
  lastError = '';
  constructor(private roots: () => string[]) {}

  /** Asigna fecha a registros sin hora: la de primera aparición, o (primer escaneo) la de la sesión. */
  private stamp(records: UsageRecord[], fallbackTs: number): void {
    for (const r of records) {
      if (r.ts) { continue; }
      let t = this.stamps.firstSeen[r.key];
      if (t === undefined) {
        t = this.stamps.baselined ? Date.now() : fallbackTs;
        this.stamps.firstSeen[r.key] = t;
        this.stampsDirty = true;
      }
      r.ts = t;
    }
  }

  /** Lee los session.db del agent host (turn_usage). */
  private refreshAgentDbs(seen: Set<string>): boolean {
    let changed = false;
    const roots = this.roots();
    let times: Map<string, number> | undefined;
    for (const f of findAgentDbs(roots)) {
      seen.add(f);
      const sig = statSig(f);
      const prev = this.files.get(f);
      if (prev && prev.mtime === sig.mtime && prev.size === sig.size) { continue; }
      try {
        const id = path.basename(path.dirname(f));
        const records = extractTurnUsage(id, readTurnUsage(f));
        if (records.some(r => !this.stamps.firstSeen[r.key])) {
          times ??= new Map(roots.flatMap(r => [...readSessionTimes(hostDbOf(r))]));
        }
        this.stamp(records, times?.get(id.split('----')[0]) ?? sig.mtime);
        this.files.set(f, { ...sig, records });
        changed = true;
      } catch (e) { this.lastError = String((e as Error).message); }
    }
    return changed;
  }

  /** Reparsea solo los archivos cuyo mtime/size cambió. Devuelve true si algo cambió. */
  refresh(): boolean {
    let changed = false;
    const seen = new Set<string>();
    this.lastError = '';
    if (this.refreshAgentDbs(seen)) { changed = true; }
    if (!this.stamps.baselined && !this.lastError) { this.stamps.baselined = true; this.stampsDirty = true; }
    for (const f of findSessionFiles(this.roots())) {
      seen.add(f);
      let st: fs.Stats;
      try { st = fs.statSync(f); } catch { continue; }
      const prev = this.files.get(f);
      if (prev && prev.mtime === st.mtimeMs && prev.size === st.size) { continue; }
      try {
        const session = parseSessionFile(f, fs.readFileSync(f, 'utf8'));
        const records = session ? extractSession(session, path.basename(f).replace(/\.jsonl?$/, ''), st.mtimeMs) : [];
        this.files.set(f, { mtime: st.mtimeMs, size: st.size, records });
        changed = true;
      } catch { /* archivo en escritura: se reintenta en el próximo ciclo */ }
    }
    for (const f of [...this.files.keys()]) { if (!seen.has(f)) { this.files.delete(f); changed = true; } }
    return changed;
  }

  /** Registros únicos; si .json y .jsonl comparten clave gana el de mayor mtime. */
  records(): UsageRecord[] {
    const byKey = new Map<string, { r: UsageRecord; m: number }>();
    for (const e of this.files.values()) {
      for (const r of e.records) {
        const cur = byKey.get(r.key);
        if (!cur || e.mtime >= cur.m) { byKey.set(r.key, { r, m: e.mtime }); }
      }
    }
    return [...byKey.values()].map(v => v.r);
  }

  aggregate(monthStart: number, now = Date.now()): Aggregate {
    const agg: Aggregate = { month: empty(), today: empty(), byModel: {}, daily: [] };
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const daily = new Map<string, { total: number; credits: number }>();
    const add = (b: Bucket, r: UsageRecord) => { b.input += r.input; b.cached += r.cached; b.output += r.output; b.credits += r.credits; };
    for (const r of this.records()) {
      if (r.ts >= monthStart) {
        add(agg.month, r);
        add(agg.byModel[r.model] ??= empty(), r);
        const d = new Date(r.ts).toLocaleDateString('sv');
        const x = daily.get(d) ?? { total: 0, credits: 0 };
        x.total += r.input + r.cached + r.output; x.credits += r.credits; daily.set(d, x);
      }
      if (r.ts >= dayStart.getTime()) { add(agg.today, r); }
    }
    agg.daily = [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));
    return agg;
  }

  /** Tokens usados desde `ts` (ms). */
  tokensSince(ts: number): number { return this.records().reduce((n, r) => (r.ts >= ts ? n + r.input + r.cached + r.output : n), 0); }

  /** Total de todos los tiempos (alimenta el crecimiento del Pokémon). */
  lifetimeTokens(): number { return this.records().reduce((s, r) => s + r.input + r.cached + r.output, 0); }
}
