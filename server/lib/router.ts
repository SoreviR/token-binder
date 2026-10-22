// The HTTP surface, with no HTTP framework in it: a request goes in, a status and a JSON body come out.
import { BATTLE_VERSION } from '../../src/game/battle';
import { verifySession } from './auth';
import * as svc from './service';
import type { Deps, Fail } from './service';

export interface Req { method: string; path: string; query: Record<string, string | undefined>; body: any; headers: Record<string, string | undefined> }
export interface Res { status: number; body: any }

const send = (r: { ok: true } | Fail): Res => (r.ok ? { status: 200, body: r } : { status: r.status, body: { ok: false, error: r.error } });
const err = (status: number, error: string): Res => ({ status, body: { ok: false, error } });

/** Every route lives under /api/v1; the router receives the part after it (e.g. "/leagues/3/duel"). */
export async function route(d: Deps, req: Req): Promise<Res> {
  const parts = req.path.split('/').filter(Boolean);
  const [a, b, c] = parts;
  const m = req.method.toUpperCase();

  if (m === 'GET' && a === 'health') { return { status: 200, body: { ok: true, battleVersion: BATTLE_VERSION } }; }
  if (m === 'GET' && a === 'public' && b === 'league') { return send(await svc.publicLeague(d, req.query.code ?? '')); }
  if (m === 'POST' && a === 'auth') { return send(await svc.login(d, req.body?.githubToken, req.body?.consent)); }

  // Everything else needs a session.
  const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const session = verifySession(auth, d.secret, d.now());
  if (!session) { return err(401, 'unauthorized'); }
  const pid = session.sub;
  if (!(await svc.playerExists(d, pid))) { return err(401, 'unknown-player'); }
  // Both sides of a duel must play by the same rules: an extension with other battle rules has to be updated first.
  const theirs = Number(req.headers['x-battle-version']);
  if (!Number.isFinite(theirs) || theirs !== BATTLE_VERSION) { return { status: 426, body: { ok: false, error: 'update-required', battleVersion: BATTLE_VERSION } }; }

  if (a === 'me' && m === 'DELETE') { return send(await svc.deleteMe(d, pid)); }
  if (a === 'me' && b === 'reborn' && m === 'POST') { return send(await svc.reborn(d, pid)); }
  if (a === 'me' && m === 'GET') { return send(await svc.myLeagues(d, pid).then(r => (r.ok ? { ...r, login: session.login, id: pid } : r))); }
  if (a === 'showcase' && m === 'PUT') { return send(await svc.setShowcase(d, pid, req.body)); }
  if (a === 'fighter' && m === 'PUT') { return send(await svc.registerFighter(d, pid, req.body)); }
  if (a === 'inbox' && m === 'GET') { return send(await svc.inbox(d, pid)); }

  if (a === 'leagues') {
    if (!b && m === 'GET') { return send(await svc.myLeagues(d, pid)); }
    if (!b && m === 'POST') { return send(await svc.createLeague(d, pid, req.body?.name)); }
    if (b === 'join' && m === 'POST') { return send(await svc.joinLeague(d, pid, req.body?.code)); }
    const id = Number(b);
    if (Number.isInteger(id)) {
      if (!c && m === 'GET') { return send(await svc.leagueView(d, pid, id)); }
      if (!c && m === 'DELETE') { return send(await svc.leaveLeague(d, pid, id)); }
      if (c === 'duel' && m === 'POST') { return send(await svc.challenge(d, pid, id, Number(req.body?.rival))); }
      if (c === 'pardon' && m === 'POST') { return send(await svc.pardon(d, pid, id, Number(req.body?.subject))); }
    }
  }
  return err(404, 'not-found');
}
