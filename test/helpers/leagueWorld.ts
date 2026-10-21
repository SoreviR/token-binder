// A league server in memory for the tests: PGlite as the database, TCGdex and GitHub faked.
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { BATTLE_VERSION } from '../../src/game/battle';
import { Db, ensureSchema, resetSchemaState } from '../../server/lib/db';
import { Req, route } from '../../server/lib/router';
import type { Deps } from '../../server/lib/service';

export const DAY = 864e5;
export const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);

/** TCGdex as the server sees it: two cards and the era table. */
export const CARDS: Record<string, any> = {
  'base1-4': { id: 'base1-4', category: 'Pokemon', name: 'Charizard', image: 'https://assets.tcgdex.net/en/base/base1/4', rarity: 'Rare', hp: 120, stage: 'Stage2', types: ['Fire'],
    variants: { holo: true }, set: { id: 'base1', name: 'Base Set' }, attacks: [{ name: 'Fire Spin', damage: 100, cost: ['Fire', 'Fire', 'Fire', 'Fire'] }], weaknesses: [{ type: 'Water' }],
    pricing: { cardmarket: { avg: 200 } } },
  'base1-58': { id: 'base1-58', category: 'Pokemon', name: 'Pikachu', image: 'https://assets.tcgdex.net/en/base/base1/58', rarity: 'Common', hp: 40, stage: 'Basic', types: ['Lightning'],
    set: { id: 'base1', name: 'Base Set' }, attacks: [{ name: 'Gnaw', damage: 10, cost: ['Colorless'] }, { name: 'Thunder Jolt', damage: 30, cost: ['Lightning', 'Colorless'] }], weaknesses: [{ type: 'Fighting' }] },
};
export const GITHUB: Record<string, { id: number; login: string }> = { tokA: { id: 1, login: 'ash' }, tokB: { id: 2, login: 'misty' }, tokC: { id: 3, login: 'brock' } };

export interface World { d: Deps; clock: { t: number }; call: (who: string | undefined, method: string, path: string, body?: any, headers?: Record<string, string>) => Promise<{ status: number; body: any }> }

export async function world(): Promise<World> {
  const pg = new PGlite();
  const db: Db = { query: async (sql, params) => (await pg.query(sql, params as any[])).rows as any };
  resetSchemaState();
  await ensureSchema(db);
  const clock = { t: T0 };
  let seed = 0.123;
  const d: Deps = {
    db, now: () => clock.t, rng: () => (seed = (seed * 9301 + 0.49297) % 1), secret: 'test-secret',
    fetchJson: async (url, init) => {
      if (url.startsWith('https://api.github.com/user')) { return GITHUB[(init?.headers?.Authorization ?? '').replace('Bearer ', '')]; }
      const card = url.match(/\/cards\/([^/?]+)$/);
      if (card) { return CARDS[decodeURIComponent(card[1])]; }
      if (/\/series\//.test(url)) { return { sets: url.endsWith('/series/base') ? [{ id: 'base1' }] : [] }; }
      return undefined;
    },
  };
  const sessions: Record<string, string> = {};
  const call: World['call'] = async (who, method, path, body, headers = {}) => {
    const req: Req = { method, path, query: {}, body, headers: { 'x-battle-version': String(BATTLE_VERSION), ...headers } };
    if (who) {
      if (!sessions[who]) {
        const r = await route(d, { method: 'POST', path: '/auth', query: {}, body: { githubToken: who, consent: true }, headers: {} });
        sessions[who] = r.body.token;
      }
      req.headers.authorization = 'Bearer ' + sessions[who];
    }
    const [p, q] = path.split('?');
    req.path = p;
    for (const [k, v] of new URLSearchParams(q ?? '')) { req.query[k] = v; }
    return route(d, req);
  };
  return { d, clock, call };
}

