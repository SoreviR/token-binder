// Sessions. The extension proves who the player is with the GitHub token VS Code holds; the server checks it once against GitHub,
// forgets it, and hands back its own signed session token. The GitHub token is never stored.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_DAYS = 30;

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export interface Session { sub: number; login: string; exp: number }

export function signSession(s: Session, secret: string): string {
  const body = b64(JSON.stringify(s));
  return body + '.' + b64(createHmac('sha256', secret).update(body).digest());
}

/** The session if the signature is valid and it has not expired. */
export function verifySession(token: string | undefined, secret: string, now: number): Session | undefined {
  const [body, sig] = (token ?? '').split('.');
  if (!body || !sig) { return undefined; }
  const good = createHmac('sha256', secret).update(body).digest();
  let given: Buffer;
  try { given = Buffer.from(sig, 'base64url'); } catch { return undefined; }
  if (given.length !== good.length || !timingSafeEqual(given, good)) { return undefined; }
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Session;
    return typeof s.sub === 'number' && typeof s.login === 'string' && s.exp > now ? s : undefined;
  } catch { return undefined; }
}

export type FetchJson = (url: string, init?: { headers?: Record<string, string> }) => Promise<any | undefined>;

/** Who owns this GitHub token (undefined if GitHub does not accept it). */
export async function githubUser(token: string, fetchJson: FetchJson): Promise<{ id: number; login: string } | undefined> {
  const u = await fetchJson('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'token-binder-server', Accept: 'application/vnd.github+json' } });
  return u && typeof u.id === 'number' && typeof u.login === 'string' ? { id: u.id, login: u.login } : undefined;
}

export const realFetchJson: FetchJson = async (url, init) => {
  try {
    const res = await fetch(url, { headers: init?.headers, signal: AbortSignal.timeout(10_000) });
    return res.ok ? await res.json() : undefined;
  } catch { return undefined; }
};
