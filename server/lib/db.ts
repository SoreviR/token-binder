// The only thing the rest of the server knows about the database: run a query, get rows. Neon in production, an in-memory
// Postgres (PGlite) in the tests.
import { SCHEMA } from './schema';

export interface Db {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
}

let ready: Promise<void> | undefined;

/** Creates the tables if they are missing (once per instance). */
export function ensureSchema(db: Db): Promise<void> {
  ready ??= (async () => { for (const stmt of SCHEMA) { await db.query(stmt); } })().catch(e => { ready = undefined; throw e; });
  return ready;
}

/** For tests: every fresh database needs its own schema run. */
export function resetSchemaState(): void { ready = undefined; }

/** Production: Neon over HTTP (no connection pool to manage in a serverless function). */
export async function neonDb(url: string): Promise<Db> {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  return { query: async <T>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[] };
}
