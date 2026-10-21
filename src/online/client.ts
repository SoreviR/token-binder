// Talks to the league server. Nothing here needs VS Code: the session store, the GitHub token and fetch are handed in, so it is
// tested with fakes. Every call returns a result instead of throwing: the game must carry on when there is no network.
export type Api<T = Record<string, any>> = ({ ok: true } & T) | { ok: false; error: string; status: number; battleVersion?: number };

export interface ClientDeps {
  serverUrl: () => string;
  secrets: { get(key: string): PromiseLike<string | undefined>; store(key: string, value: string): PromiseLike<void>; delete(key: string): PromiseLike<void> };
  /** The GitHub token VS Code holds for the player; `createIfNone` may show the sign-in prompt. */
  githubToken: (createIfNone: boolean) => Promise<string | undefined>;
  fetch: typeof fetch;
  battleVersion: number;
  timeoutMs?: number;
}

const KEY = 'tokenBinder.league.session.v1';

export class LeagueClient {
  constructor(private d: ClientDeps) {}

  get configured(): boolean { return !!this.base(); }

  private base(): string { return this.d.serverUrl().trim().replace(/\/+$/, ''); }

  async hasSession(): Promise<boolean> { return !!(await this.d.secrets.get(KEY)); }

  /** Signs in with the player's GitHub account. `consent` must be true: the caller shows the data notice first. */
  async connect(consent: boolean): Promise<Api<{ login: string }>> {
    const token = await this.d.githubToken(true);
    if (!token) { return { ok: false, error: 'github-cancelled', status: 0 }; }
    return this.login(token, consent);
  }

  private async login(githubToken: string, consent: boolean): Promise<Api<{ login: string }>> {
    const r = await this.raw('POST', '/auth', { githubToken, consent }, undefined);
    if (!r.ok) { return r; }
    await this.d.secrets.store(KEY, String(r.token));
    return { ok: true, login: String(r.login) };
  }

  async disconnect(): Promise<void> { await this.d.secrets.delete(KEY); }

  /** An authenticated call. An expired session is renewed once, silently, with the GitHub session VS Code already has. */
  async call<T = Record<string, any>>(method: string, path: string, body?: unknown): Promise<Api<T>> {
    let token = await this.d.secrets.get(KEY);
    if (!token) {
      const gh = await this.d.githubToken(false);
      if (!gh || !(await this.login(gh, true)).ok) { return { ok: false, error: 'not-connected', status: 401 }; }
      token = await this.d.secrets.get(KEY);
    }
    let r = await this.raw<T>(method, path, body, token);
    if (!r.ok && r.status === 401) {
      const gh = await this.d.githubToken(false);
      if (gh && (await this.login(gh, true)).ok) { r = await this.raw<T>(method, path, body, await this.d.secrets.get(KEY)); }
      else { await this.disconnect(); }
    }
    return r;
  }

  private async raw<T = Record<string, any>>(method: string, path: string, body: unknown, token: string | undefined): Promise<Api<T>> {
    const base = this.base();
    if (!base) { return { ok: false, error: 'no-server', status: 0 }; }
    try {
      const res = await this.d.fetch(`${base}/api/v1${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-battle-version': String(this.d.battleVersion), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.d.timeoutMs ?? 15_000),
      });
      let json: any;
      try { json = await res.json(); } catch { json = undefined; }
      if (res.ok && json?.ok) { return json as Api<T>; }
      return { ok: false, error: String(json?.error ?? `http-${res.status}`), status: res.status, battleVersion: json?.battleVersion };
    } catch { return { ok: false, error: 'offline', status: 0 }; }
  }
}
