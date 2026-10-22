// The "League" tab of the album: what the player sees (leagues, ranking, rivals, replays) and what the buttons do.
// VS Code is reached only through `LeagueHost`, so the whole flow is tested with fakes.
import { Fighter, estimateWin, effectiveness, factorGaps } from '../game/battle';
import type { GameState } from '../game/engine';
import { battleOf, grantBattleXp, playerFighter, rollDaily } from '../game/leaders';
import { showcaseKey } from '../game/showcase';
import type { LeagueClient } from './client';

export interface LeagueHost {
  client: LeagueClient;
  getState(): GameState | undefined;
  save(): Promise<void>;
  refresh(): Promise<void>;
  quotaPct(): number;
  /** Lifetime tokens: part of the save report the server uses to tell an honest save from an edited one. */
  lifetime(): number;
  /** "Volver a nacer": wipes the local progress to zero (used to get out of a BUSTED flag). */
  rebirth(): Promise<void>;
  /** The player's own setting: nothing goes online while it is off. */
  enabled(): boolean;
  setEnabled(on: boolean): Promise<void>;
  /** The data notice, as a modal. Resolves true only if the player accepts. */
  confirmConsent(): Promise<boolean>;
  confirm(message: string, button: string): Promise<boolean>;
  notify(message: string, ...actions: string[]): Promise<string | undefined>;
  /** To the album webview. */
  post(data: unknown): void;
  sendBattle(data: unknown): void;
  /** A card thumbnail that is already on disk (and a background download of it if not). */
  thumb(card: { id: string; image?: string }): string | undefined;
  openExternal(url: string): void;
  copy(text: string): void;
  serverUrl(): string;
  memory: { get<T>(key: string, fallback: T): T; set(key: string, value: unknown): PromiseLike<void> };
  now(): number;
  t(key: string, ...args: (string | number)[]): string;
}

interface LeagueRow { id: number; name: string; code: string; elo: number; members: number }
interface RemoteFighter { cardId: string; image?: string; key: string; name: string; types: string[]; tier: number; level: number; grade?: number; held?: string }
interface Replay {
  id: number; league: string; rival: string; won: boolean; eloChange: number; at: string; rounds: number; reason: string;
  log: any[]; me: any; foe: any; incoming: boolean;
}

const SELECTED = 'tokenBinder.league.selected.v1';
const REPLAYS = 'tokenBinder.league.replays.v1';
const MAX_REPLAYS = 10;
const SYNC_EVERY = 5 * 60_000;

export class LeagueController {
  private connected = false;
  private login = '';
  private busy = false;
  private error: string | undefined;
  private notice: string | undefined;
  private leagues: LeagueRow[] = [];
  private selected: number | undefined;
  private board: any;
  private registered: { name: string; level: number; clamped: boolean; levelCap: number; busted: boolean } | undefined;
  private lastSync = 0;
  private showcaseStatus = '';   // '', 'ok', 'old' (the server has no such route yet) or 'error:<code>'
  private sentShowcase = '';   // the showcase as last sent, so it is only sent again when it changes

  constructor(private h: LeagueHost) {
    this.selected = h.memory.get<number | undefined>(SELECTED, undefined);
  }

  /* ───── what the tab shows ───── */

  private replays = (): Replay[] => this.h.memory.get<Replay[]>(REPLAYS, []);

  private decorate(f: RemoteFighter | undefined) { return f ? { ...f, src: this.h.thumb({ id: f.cardId, image: f.image }) } : undefined; }

  data() {
    const s = this.h.getState();
    const local = s ? playerFighter(s, this.h.quotaPct()) : undefined;
    return {
      configured: this.h.client.configured, enabled: this.h.enabled(), connected: this.connected, login: this.login, busy: this.busy,
      error: this.error, notice: this.notice, leagues: this.leagues, selected: this.selected,
      board: this.board && { ...this.board, members: this.board.members.map((m: any) => ({ ...m, fighter: this.decorate(m.fighter), showcase: m.showcase && { ...m.showcase, src: this.h.thumb({ id: m.showcase.cardId, image: m.showcase.image }) } })) },
      local: local ? (local.ok ? { ok: true, name: local.fighter.name, level: local.fighter.level } : { ok: false, reason: local.reason }) : { ok: false, reason: 'none' },
      registered: this.registered,
      showcase: this.localShowcase(s),
      replays: this.replays().map(({ log: _l, me: _m, foe: _f, ...r }) => r),
      server: this.h.serverUrl().replace(/\/+$/, ''),
    };
  }

  push(): void { this.h.post({ type: 'league', data: this.data() }); }

  private async run<T>(work: () => Promise<T>): Promise<T | undefined> {
    this.busy = true; this.error = undefined; this.notice = undefined; this.push();
    try { return await work(); } finally { this.busy = false; this.push(); }
  }

  private fail(error: string): void { this.error = error; }

  /* ───── messages from the webview ───── */

  async handle(m: { type: string; [k: string]: any }): Promise<void> {
    switch (m.type) {
      case 'leagueOpen': return this.open();
      case 'leagueConnect': return this.connect();
      case 'leagueCreate': return this.createLeague(String(m.name ?? ''));
      case 'leagueJoin': return this.joinLeague(String(m.code ?? ''));
      case 'leagueSelect': return this.select(Number(m.id));
      case 'leagueLeave': return this.leave(Number(m.id));
      case 'leagueChallenge': return this.challenge(Number(m.rival));
      case 'leaguePardon': return this.pardon(Number(m.subject));
      case 'leagueReborn': return this.reborn();
      case 'leagueReplay': return this.replay(Number(m.id));
      case 'leagueRefresh': return this.sync(true);
      case 'leagueCopy': if (typeof m.code === 'string') { this.h.copy(m.code); } return;
      case 'leaguePage': if (typeof m.code === 'string' && this.h.client.configured) { this.h.openExternal(`${this.h.serverUrl().replace(/\/+$/, '')}/l/${encodeURIComponent(m.code)}`); } return;
      case 'leagueDelete': await this.deleteData(); return;
    }
  }

  /** The tab was opened: show what we know and catch up with the server if we are signed in. */
  async open(): Promise<void> {
    this.connected = this.h.enabled() && await this.h.client.hasSession();
    this.push();
    if (this.connected) { await this.sync(false); }
  }

  async connect(): Promise<void> {
    if (!this.h.client.configured) { this.fail('no-server'); this.push(); return; }
    await this.run(async () => {
      if (!(await this.h.confirmConsent())) { return; }
      await this.h.setEnabled(true);
      const r = await this.h.client.connect(true);
      if (!r.ok) { this.fail(r.error); return; }
      this.connected = true; this.login = r.login;
      await this.syncInner(true);
    });
  }

  /** Brings everything up to date: leagues, the board, the registered fighter and the duels received. At most every 5 minutes unless forced. */
  async sync(force: boolean): Promise<void> {
    if (!this.connected || !this.h.enabled()) { return; }
    if (!force && this.h.now() - this.lastSync < SYNC_EVERY) { return; }
    await this.run(() => this.syncInner(force));
  }

  private async syncInner(_force: boolean): Promise<void> {
    this.lastSync = this.h.now();
    await this.registerFighter();
    await this.syncShowcase();
    const me = await this.h.client.call<{ leagues: LeagueRow[]; login?: string }>('GET', '/me');
    if (!me.ok) { return this.handleFailure(me); }
    this.leagues = me.leagues; this.login = me.login ?? this.login;
    if (this.selected === undefined || !this.leagues.some(l => l.id === this.selected)) { this.selected = this.leagues[0]?.id; await this.h.memory.set(SELECTED, this.selected); }
    await this.loadBoard();
    await this.checkInbox();
  }

  /** The whole-save figures sent with the fighter, so the server can tell an honest save from an edited one. */
  private profile(s: GameState) {
    const cards = Object.values(s.collection);
    return {
      coins: Math.floor(s.coins), cards: cards.length, items: Object.values(s.items ?? {}).reduce((n, c) => n + (c ?? 0), 0),
      xp: cards.reduce((n, o) => n + (o.xp ?? 0), 0), tokens: this.h.lifetime(),
    };
  }

  /** The player's own showcase as the League tab shows it, with whether the server has it. */
  private localShowcase(s: GameState | undefined) {
    const key = s ? showcaseKey(s) : undefined;
    const o = s && key ? s.collection[key] : undefined;
    return o ? { name: o.card.name, grade: o.grade, src: this.h.thumb({ id: o.card.id, image: o.card.image }), status: this.showcaseStatus } : undefined;
  }

  /** Tells the server which card to show off. Sent only when it changes (or when forced, e.g. after reconnecting). */
  async syncShowcase(force = false, reload = false): Promise<void> {
    const s = this.h.getState();
    const key = s ? showcaseKey(s) : undefined;
    if (!s || !key) { return; }
    const grade = s.collection[key].grade;
    const sig = `${key}|${grade ?? ''}`;
    if (!force && sig === this.sentShowcase) { return; }
    const r = await this.h.client.call('PUT', '/showcase', { key, grade });
    if (r.ok) { this.sentShowcase = sig; this.showcaseStatus = 'ok'; if (reload && this.connected) { await this.loadBoard(); this.push(); } }
    else if (r.status === 426 || r.status === 401) { this.handleFailure(r); }
    else { this.showcaseStatus = r.status === 404 && r.error === 'not-found' ? 'old' : 'error:' + r.error; if (reload) { this.push(); } }
  }

  /** Puts the card the player takes to battle on the server, with its current level, grade and item. */
  private async registerFighter(): Promise<void> {
    const s = this.h.getState();
    if (!s) { return; }
    const me = playerFighter(s, this.h.quotaPct());
    if (!me.ok || !s.fighter) { this.registered = undefined; return; }
    const o = s.collection[s.fighter];
    const r = await this.h.client.call<{ fighter: RemoteFighter; clamped: boolean; levelCap: number; busted: boolean }>('PUT', '/fighter',
      { key: s.fighter, xp: o.xp, grade: o.grade, held: o.held, quotaPct: Math.round(this.h.quotaPct()), profile: this.profile(s) });
    if (!r.ok) { this.registered = undefined; if (r.status === 426 || r.status === 401) { this.handleFailure(r); } return; }
    this.registered = { name: r.fighter.name, level: r.fighter.level, clamped: r.clamped, levelCap: r.levelCap, busted: r.busted };
  }

  private handleFailure(r: { ok: false; error: string; status: number }): void {
    if (r.error === 'not-connected' || r.error === 'unauthorized' || r.error === 'unknown-player') { this.connected = false; this.leagues = []; this.board = undefined; }
    this.fail(r.error);
  }

  private async loadBoard(): Promise<void> {
    if (this.selected === undefined) { this.board = undefined; return; }
    const r = await this.h.client.call('GET', `/leagues/${this.selected}`);
    if (!r.ok) { this.board = undefined; return this.handleFailure(r); }
    this.board = r;
    // A pardon is per league, so what matters to the player is whether they are BUSTED in the league they are looking at.
    const mine = (r as { members?: { you: boolean; busted: boolean }[] }).members?.find(m => m.you);
    if (mine && this.registered) { this.registered.busted = mine.busted; }
  }

  /* ───── leagues ───── */

  private async createLeague(name: string): Promise<void> {
    await this.run(async () => {
      const r = await this.h.client.call<{ league: { id: number } }>('POST', '/leagues', { name });
      if (!r.ok) { return this.handleFailure(r); }
      this.selected = r.league.id; await this.h.memory.set(SELECTED, this.selected);
      await this.syncInner(true);
    });
  }

  private async joinLeague(code: string): Promise<void> {
    await this.run(async () => {
      const r = await this.h.client.call<{ league: { id: number } }>('POST', '/leagues/join', { code });
      if (!r.ok) { return this.handleFailure(r); }
      this.selected = r.league.id; await this.h.memory.set(SELECTED, this.selected);
      await this.syncInner(true);
    });
  }

  private async select(id: number): Promise<void> {
    if (!this.leagues.some(l => l.id === id)) { return; }
    this.selected = id; await this.h.memory.set(SELECTED, id);
    await this.run(() => this.loadBoard());
  }

  private async leave(id: number): Promise<void> {
    const l = this.leagues.find(x => x.id === id);
    if (!l || !(await this.h.confirm(this.h.t('league.leaveConfirm', l.name), this.h.t('league.leave')))) { return; }
    await this.run(async () => {
      const r = await this.h.client.call('DELETE', `/leagues/${id}`);
      if (!r.ok) { return this.handleFailure(r); }
      if (this.selected === id) { this.selected = undefined; }
      await this.syncInner(true);
    });
  }

  /** Erases everything the server holds about the player and signs out. */
  async deleteData(): Promise<boolean> {
    if (!(await this.h.confirm(this.h.t('league.deleteConfirm'), this.h.t('league.delete')))) { return false; }
    let done = false;
    await this.run(async () => {
      const r = await this.h.client.call('DELETE', '/me');
      if (!r.ok && r.error !== 'unknown-player' && r.error !== 'not-connected') { return this.handleFailure(r); }
      await this.h.client.disconnect();
      await this.h.memory.set(SELECTED, undefined); await this.h.memory.set(REPLAYS, []);
      this.connected = false; this.leagues = []; this.board = undefined; this.selected = undefined; this.registered = undefined; this.login = ''; this.sentShowcase = ''; this.showcaseStatus = '';
      this.notice = 'deleted';
      done = true;
    });
    return done;
  }

  /* ───── duels ───── */

  private async challenge(rival: number): Promise<void> {
    if (this.selected === undefined) { return; }
    const league = this.leagues.find(l => l.id === this.selected);
    const s = this.h.getState();
    await this.run(async () => {
      await this.registerFighter();   // the card goes in as it is right now
      const r = await this.h.client.call<any>('POST', `/leagues/${this.selected}/duel`, { rival });
      if (!r.ok) { return this.handleFailure(r); }
      const view = this.view({ id: r.duelId, league: league?.name ?? '', rival: r.rival, won: r.won, eloChange: r.eloChange, at: new Date(this.h.now()).toISOString(), rounds: r.rounds, reason: r.reason, log: r.log, me: r.me, foe: r.foe, incoming: false });
      // Fighting trains the card, with the same small daily allowance as any other fight.
      let outcome: { xp?: number; levelUp?: number } = { xp: 0 };
      const mine = s?.fighter;
      if (s && mine && mine === r.me.cardKey && s.collection[mine]) {
        rollDaily(battleOf(s), this.h.now());
        outcome = grantBattleXp(s, r.won);
        await this.h.save(); await this.h.refresh();
      }
      this.h.sendBattle({ ...view, outcome: { coins: 0, ...outcome, elo: r.elo, eloChange: r.eloChange } });
      await this.loadBoard();
    });
  }

  /** Vote to lift another member's BUSTED flag. A majority of the other members clears it. */
  private async pardon(subject: number): Promise<void> {
    if (this.selected === undefined || !Number.isInteger(subject)) { return; }
    await this.run(async () => {
      const r = await this.h.client.call('POST', `/leagues/${this.selected}/pardon`, { subject });
      if (!r.ok) { return this.handleFailure(r); }
      await this.loadBoard();
    });
  }

  /** "He sido un tramposo y quiero jugar de nuevo": wipe the local save to zero and tell the server, which lifts the flag. */
  private async reborn(): Promise<void> {
    if (!(await this.h.confirm(this.h.t('league.rebornConfirm'), this.h.t('league.rebornYes')))) { return; }
    await this.run(async () => {
      // The server first: if it cannot be reached, nothing was wiped and the player is no worse off.
      const r = await this.h.client.call('POST', '/me/reborn');
      if (!r.ok) { return this.handleFailure(r); }
      await this.h.rebirth();
      await this.syncInner(true);
    });
  }

  /** The data the arena needs to play a duel (the same screen as a gym battle). */
  private view(r: Replay) {
    const fv = (f: any) => ({ ...f, key: f.cardKey, src: this.h.thumb({ id: f.cardId, image: f.image }), care: {}, wear: 0, moves: (f.moves ?? []).map((m: any) => m.name) });
    const odds = estimateWin(r.me as Fighter, r.foe as Fighter, 200, 31);
    return {
      leader: { id: 'duel', name: r.rival, level: r.foe.level },
      me: fv(r.me), foe: fv(r.foe), odds, won: r.won, rounds: r.rounds, reason: r.reason, log: r.log,
      gaps: factorGaps(r.me as Fighter, r.foe as Fighter).slice(0, 3),
      typeEdge: effectiveness(r.me as Fighter, r.foe as Fighter).eff === 'weak' ? 'me' : effectiveness(r.foe as Fighter, r.me as Fighter).eff === 'weak' ? 'foe' : undefined,
      duel: { rival: r.rival, league: r.league, eloChange: r.eloChange, incoming: r.incoming },
    };
  }

  private async replay(id: number): Promise<void> {
    const r = this.replays().find(x => x.id === id);
    if (!r) { return; }
    this.h.sendBattle({ ...this.view(r), outcome: { coins: 0, xp: 0, eloChange: r.eloChange } });
  }

  /** Duels other players started against the player: kept for replay and announced once. */
  async checkInbox(): Promise<void> {
    const r = await this.h.client.call<{ duels: any[] }>('GET', '/inbox');
    if (!r.ok || !r.duels.length) { return; }
    const fresh: Replay[] = r.duels.map(d => ({
      id: d.id, league: d.league, rival: d.challenger, won: d.won, eloChange: d.eloChange, at: d.at, rounds: d.rounds, reason: d.reason, log: d.log, me: d.me, foe: d.foe, incoming: true,
    }));
    await this.h.memory.set(REPLAYS, [...fresh, ...this.replays().filter(x => !fresh.some(f => f.id === x.id))].slice(0, MAX_REPLAYS));
    const lost = fresh.filter(d => !d.won).length;
    const text = fresh.length === 1
      ? this.h.t(fresh[0].won ? 'league.incomingWon' : 'league.incomingLost', fresh[0].rival, fresh[0].league)
      : this.h.t('league.incomingMany', fresh.length, lost);
    void this.h.notify(text, this.h.t('league.watch')).then(a => { if (a) { void this.replay(fresh[0].id); } });
  }

  /** Called by a timer: look for duels received while the album was closed. No-op when the player is not signed in. */
  async poll(): Promise<void> {
    if (!this.h.enabled() || !(await this.h.client.hasSession())) { return; }
    this.connected = true;
    await this.checkInbox();
    this.push();
  }
}
