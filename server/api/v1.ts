// The only serverless function: everything under /api/v1 goes through the router in ../lib/router.ts.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonDb, ensureSchema } from '../lib/db';
import { realFetchJson } from '../lib/auth';
import { route } from '../lib/router';
import { randomInt } from 'node:crypto';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const url = process.env.DATABASE_URL, secret = process.env.SESSION_SECRET;
  if (!url || !secret) { res.status(503).json({ ok: false, error: 'not-configured' }); return; }
  try {
    const db = await neonDb(url);
    await ensureSchema(db);
    const query: Record<string, string | undefined> = {};
    for (const [k, v] of new URL(req.url ?? '/', 'http://x').searchParams) { query[k] = v; }
    const path = '/' + (query.route ?? '');
    delete query.route;
    const out = await route(
      { db, now: () => Date.now(), rng: () => randomInt(0, 2 ** 31) / 2 ** 31, fetchJson: realFetchJson, secret },
      { method: req.method ?? 'GET', path, query, body: req.body, headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) });
    res.setHeader('Cache-Control', 'no-store');
    res.status(out.status).json(out.body);
  } catch (e) {
    console.error('[api]', e);
    res.status(500).json({ ok: false, error: 'server-error' });
  }
}
