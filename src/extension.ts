import * as vscode from 'vscode';
import * as path from 'path';
import { UsageStore, totalOf } from './usage/store';
import { defaultRoots, runningUserRoot, uniqueRoots } from './usage/paths';
import { fmt, parseLimit, percent, periodEnd, periodStart, used, Unit } from './quota';
import { GameStore } from './game/state';
import {
  accrueXp, addCards, applyTransform, branchOptions, buy, CARD_DATA_VERSION, Card, chooseEvolution, consume, countOf, earnCoins, equipHeld, GameState, levelOf, openBox, unequipHeld,
  useLuckyEgg, useRareCandy, grantPacks, Item, keyOf, levelProgress, MAX_LUCK, MAX_SLOTS,
  newState, nextPackProgress, normalize, PackKind, priceOf, rebaseLifetime, resolveDue, sellDuplicates, sellValue, startTraining, trainingProgress, underPace,
  untrain,
} from './game/engine';
import { collectorLabel, marketValue, statsOf } from './game/stats';
import { MIN_TRANSFORM_LEVEL, TRANSFORM_BY_ITEM, Transform, canTransform, isItemId } from './game/items';
import { Tcgdex } from './game/tcgdex';
import { BinderViewProvider, WebviewMessage } from './webview/provider';
import { AlbumPanel } from './webview/albumPanel';
import { migrateLegacySettings, migrateLegacyState, offerUninstallLegacy } from './migrate';
import { lastBackend } from './usage/sqlite';
import { lang, resolveLang, setLang, t } from './i18n';
import { Updater } from './update/updater';
import { backupIfUpgraded, exportPayload, parseImport } from './game/backup';
import { registerDevTools } from './devhook';
import { BATTLE_VERSION, Fighter, effectiveness, estimateWin, factorGaps, simulate } from './game/battle';
import { LeagueClient } from './online/client';
import { LeagueController } from './online/controller';
import { LEADERS, LEADER_BY_ID, REMATCH_DAILY_CAP, battleOf, dayKey, leaderFighter, leaderUnlocked, playerFighter, recordBattle, setFighter } from './game/leaders';
import { GOALS, checkGoals, progressOf } from './game/goals';
import { BOSS_ATTEMPTS, BOSS_REWARD, CUP_FEE, CUP_PRIZE, CUP_ROUNDS, bossOfWeek, bossStatus, cupPlayedToday, cupRivals, enterCup, finishCup, recordBossBattle, recordCupRound } from './game/modes';
import { noteRecap, recapView } from './game/recap';
import { FRAMES, buyFrame, equipFrame, isFrameId } from './game/cosmetics';
import { clearShowcase, pinShowcase, showcaseKey } from './game/showcase';
import { ELITE, ELITE_BY_ID, eliteBeaten, eliteCards, eliteUnlocked, recordEliteBattle } from './game/elite';
import { TEAM_SIZE, addToTeam, estimateTeamWin, removeFromTeam, simulateTeam, teamKeys } from './game/team';
import { MishapResult, ROCKET, dryCard, overageMishap, recordRocketBattle } from './game/mishaps';
import { PROTECTORS, Protector, applyWear, cancelGrading, cancelRefund, conditionMultiplier, gradeCost, gradeMultiplier, gradingProgress, protect, resolveGrading, sendToGrading, wearChance } from './game/grading';

const cfg = () => vscode.workspace.getConfiguration('tokenBinder');

/** Did the player set their own monthly limit? Without it, "100% of the quota" means nothing. */
const quotaIsSet = (): boolean => {
  const i = cfg().inspect<number>('quota.monthlyLimit');
  return i?.globalValue !== undefined || i?.workspaceValue !== undefined || i?.workspaceFolderValue !== undefined;
};

export function activate(ctx: vscode.ExtensionContext): void {
  const roots = () => { const r = cfg().get<string[]>('storageRoots', []); return r.length ? r : uniqueRoots([runningUserRoot(ctx.globalStorageUri.fsPath), ...defaultRoots()]); };
  const applyLanguage = () => setLang(resolveLang(cfg().get<string>('language', 'auto'), vscode.env.language));
  applyLanguage();
  const log = vscode.window.createOutputChannel('TokenBinder');
  // It used to be called PokeToken: its progress is recovered BEFORE the state is read (this runs synchronously).
  migrateLegacyState(ctx, s => log.appendLine(s));
  // Before the new version touches the saved progress, keep a copy when the extension has just been updated.
  const version = String(ctx.extension.packageJSON.version);
  void backupIfUpgraded(ctx.globalState, version, path.join(ctx.globalStorageUri.fsPath, 'backups'))
    .then(file => { if (file) { log.appendLine(`[backup] progress saved before updating to ${version}: ${file}`); } })
    .catch(e => log.appendLine(`[backup] failed: ${e}`));
  const updater = new Updater(ctx, s => log.appendLine(s));
  const usage = new UsageStore(roots);
  usage.stamps = ctx.globalState.get('tokenBinder.stamps.v1', usage.stamps);
  usage.peaks = ctx.globalState.get('tokenBinder.peaks.v1', usage.peaks);
  const game = new GameStore(ctx.globalState);
  const cacheDir = path.join(ctx.globalStorageUri.fsPath, 'tcg');
  const tcg = new Tcgdex(cacheDir);

  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  bar.command = 'tokenBinder.open';
  bar.show();
  // Unopened packs: the panel is rarely visible, so they are announced from the status bar.
  const packBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  packBar.command = 'tokenBinder.open';

  const provider = new BinderViewProvider(ctx.extensionUri, vscode.Uri.file(cacheDir), () => void tick(true), m => void onMessage(m, 'side'));
  const album = new AlbumPanel(ctx.extensionUri, vscode.Uri.file(cacheDir), () => void tick(true), m => void onMessage(m, 'album'));
  // Online leagues (opt-in): the session lives in VS Code's secret storage, never in settings or the saved progress.
  const leagueClient = new LeagueClient({
    serverUrl: () => cfg().get<string>('online.server', ''),
    secrets: ctx.secrets,
    githubToken: async create => {
      try { return (await vscode.authentication.getSession('github', ['read:user'], create ? { createIfNone: true } : { silent: true }))?.accessToken; }
      catch { return undefined; }
    },
    fetch, battleVersion: BATTLE_VERSION,
  });
  const leagueThumbs = new Set<string>();
  const league = new LeagueController({
    client: leagueClient,
    getState: () => state,
    save: async () => { if (state) { await game.save(state); } },
    refresh: () => tick(true),
    quotaPct: () => lastQuotaPct,
    lifetime: () => usage.lifetimeTokens(),
    rebirth: async () => { state = newState(usage.lifetimeTokens()); await game.save(state); await tick(true); },
    enabled: () => cfg().get<boolean>('online.enabled', false),
    setEnabled: on => Promise.resolve(cfg().update('online.enabled', on, vscode.ConfigurationTarget.Global)),
    confirmConsent: async () => (await vscode.window.showInformationMessage(t('league.consent', leagueClient.host), { modal: true }, t('league.consentButton'))) === t('league.consentButton'),
    confirm: async (message, button) => (await vscode.window.showWarningMessage(message, { modal: true }, button)) === button,
    notify: async (message, ...actions) => vscode.window.showInformationMessage(message, ...actions),
    post: d => album.send(d as WebviewMessage),
    sendBattle: d => album.send({ type: 'battleResult', data: d }),
    sendRounds: rounds => album.send({ type: 'cupResult', rounds }),
    thumb: c => {
      // What the server says about a card is data, not a command: only cards from TCGdex's own image host are ever downloaded.
      if (!c.image || !c.image.startsWith('https://assets.tcgdex.net/') || !/^[\w.-]{1,40}$/.test(c.id)) { return undefined; }
      const card = { id: c.id, image: c.image } as Card;
      const file = tcg.cachedImage(card, 'low');
      if (file) { return album.uri(file); }
      if (!leagueThumbs.has(c.id)) { leagueThumbs.add(c.id); void tcg.image(card, 'low').then(f => { if (f) { league.push(); } }); }
      return undefined;
    },
    openExternal: url => { void vscode.env.openExternal(vscode.Uri.parse(url)); },
    copy: text => { void vscode.env.clipboard.writeText(text); },
    serverUrl: () => cfg().get<string>('online.server', ''),
    memory: { get: (k, f) => ctx.globalState.get(k, f), set: (k, v) => ctx.globalState.update(k, v) },
    now: () => Date.now(),
    t: (key, ...args) => t(key as 'league.watch', ...args),
  });
  let state: GameState | undefined;
  let busy = false;
  let opening = false;
  let lastLogged = '';
  let lastEvolveTry = 0;
  let prefetching = false;
  const failedThumbs = new Set<string>(); // do not retry in a loop when offline; cleared on reload
  const failedEnrich = new Set<string>();
  let enriching = false;
  let prevUsed: number | undefined;          // usage at the previous refresh: a mishap needs the usage to have grown
  let lastQuotaPct = 0;                      // share of the monthly quota used (feeds the token-usage bonus in battles)
  let fetchingLeaders = false;

  let rerun = false;
  async function tick(force = false): Promise<void> {
    if (busy) { rerun = rerun || force; return; } // do not lose a refresh requested while we are busy
    busy = true;
    try {
      const changed = usage.refresh();
      if (usage.stampsDirty) { usage.stampsDirty = false; await ctx.globalState.update('tokenBinder.stamps.v1', usage.stamps); }
      if (usage.peaksDirty) { usage.peaksDirty = false; await ctx.globalState.update('tokenBinder.peaks.v1', usage.peaks); }
      if (usage.lastError && usage.lastError !== lastLogged) { lastLogged = usage.lastError; log.appendLine(`[error] ${usage.lastError}`); }
      if (changed) { log.appendLine(`[usage] ${usage.records().length} records (${lastBackend})`); }
      if (!changed && !force && state) { return; }
      const unit = cfg().get<Unit>('quota.unit', 'tokens');
      const limit = cfg().get<number>('quota.monthlyLimit', 5_000_000);
      const mult = cfg().get<number>('growth.multiplier', 1);
      const now = Date.now();
      const start = periodStart(now, cfg().get<number>('quota.resetDay', 1));
      const agg = usage.aggregate(start, now);
      const usedNow = used(agg.month, unit);
      const pct = percent(usedNow, limit);
      lastQuotaPct = pct;
      const lifetime = usage.lifetimeTokens();

      state ??= game.load(lifetime);
      // Saves from before the cache stopped counting keep their progress: every mark moves to the new scale.
      if (state.metric !== 2) { rebaseLifetime(state, lifetime - usage.rawLifetimeTokens()); }
      const events: string[] = [];
      const every = cfg().get<number>('packs.everyTokens', 750_000);
      const granted = grantPacks(state, lifetime, every);
      if (granted) { events.push(`packs:${granted}`); }
      const resetDay = cfg().get<number>('quota.resetDay', 1);
      const pace = underPace(pct, now, start, periodEnd(now, resetDay));
      earnCoins(state, lifetime, pace);
      if (pct >= 100 && state.bonusPeriod !== start) { state.bonusPeriod = start; state.packs++; events.push('bonusPack'); }
      // Mishaps are opt-in, only count if the quota was set by the player (the default is just a placeholder), and only when
      // the usage actually grew: changing the limit or the reset day must never trigger one.
      const grew = prevUsed !== undefined && usedNow > prevUsed;
      prevUsed = usedNow;
      const mishap = grew && cfg().get<boolean>('mishaps.enabled', false) && quotaIsSet() ? overageMishap(state, pct, start) : null;
      if (mishap) { announceMishap(mishap); }
      events.push(...accrueXp(state, lifetime));
      events.push(...resolveGrading(state, lifetime));
      // Evolution/graduation: needs the network; if it fails it is retried at most every 30 s.
      const due = state.slots.some(t => t && trainingProgress(t, lifetime, mult).due);
      if (due && now - lastEvolveTry > 30_000) {
        lastEvolveTry = now;
        try { events.push(...await resolveDue(state, lifetime, mult, tcg.findNext)); } catch (e) { log.appendLine(`[error] evolution: ${e}`); }
      }
      events.push(...checkGoals(state, now));
      noteRecap(state, events, now);
      await game.save(state);

      await alerts(start, pct);
      renderBar(bar, unit, usedNow, pct, agg.today, agg.month, agg.byModel);
      renderPackBar(packBar, state);
      if (provider.visible) { provider.post(await snapshot(unit, limit, usedNow, pct, agg, state, lifetime, mult, every, events, pace)); }
      if (album.open) { album.post(await albumData(state)); }
    } finally {
      busy = false;
      if (rerun) { rerun = false; void tick(true); }
    }
  }

  /** Messages from the panels: open a pack, buy, train, open the album, request the large image. */
  async function onMessage(m: WebviewMessage, from: 'side' | 'album'): Promise<void> {
    if (!state) { return; }
    const target = from === 'album' ? album : provider;
    if (m.type === 'openAlbum') { album.show(['items', 'goals', 'battle'].includes(m.tab as string) ? (m.tab as string) : undefined); }
    else if (m.type === 'startCup') { await startCup(); }
    else if (m.type === 'pinShowcase' && typeof m.id === 'string') { if (pinShowcase(state, m.id)) { await game.save(state); await tick(true); void league.syncShowcase(false, true); } }
    else if (m.type === 'clearShowcase') { clearShowcase(state); await game.save(state); await tick(true); void league.syncShowcase(false, true); }
    else if (m.type === 'startElite' && typeof m.id === 'string') { await startElite(m.id); }
    else if (m.type === 'teamAdd' && typeof m.id === 'string') { if (addToTeam(state, m.id)) { await game.save(state); await tick(true); } }
    else if (m.type === 'teamRemove' && typeof m.id === 'string') { if (removeFromTeam(state, m.id)) { await game.save(state); await tick(true); } }
    else if (m.type === 'buyFrame' && isFrameId(m.id)) { if (buyFrame(state, m.id)) { await game.save(state); await tick(true); } }
    else if (m.type === 'equipFrame' && typeof m.id === 'string') { if (equipFrame(state, m.id)) { await game.save(state); await tick(true); } }
    else if (m.type === 'dismissRecap') { delete state.recap; await game.save(state); await tick(true); }
    else if (m.type === 'tourDone') { state.tour = true; await game.save(state); await tick(true); }
    else if (m.type === 'openPack') { await openPack(m.kind === 'premium' || m.kind === 'ball' ? m.kind : 'pack'); }
    else if (m.type === 'buy' && typeof m.item === 'string') {
      if (buy(state, m.item as Item)) { await game.save(state); await tick(true); }
    } else if (m.type === 'sell' && typeof m.id === 'string') {
      const earned = sellDuplicates(state, m.id);
      if (earned) { await game.save(state); await tick(true); }
    } else if (m.type === 'sellAll') {
      const n = Object.values(state.collection).reduce((s, o) => s + (o.soaked ? 0 : Math.max(0, o.count - 1)), 0);
      if (!n) { void vscode.window.showInformationMessage(t('sell.none')); return; }
      const ok = await vscode.window.showWarningMessage(t('sell.confirm', n), { modal: true }, t('sell.button'));
      if (ok === t('sell.button')) {
        const earned = sellDuplicates(state);
        await game.save(state); await tick(true);
        void vscode.window.showInformationMessage(t('sell.done', n, Math.floor(earned)));
      }
    } else if (m.type === 'train' && typeof m.id === 'string') {
      if (startTraining(state, m.id, usage.lifetimeTokens())) { await game.save(state); await tick(true); }
    } else if (m.type === 'untrain' && typeof m.id === 'string') {
      if (untrain(state, m.id)) { await game.save(state); await tick(true); }
    } else if (m.type === 'openBox') {
      const found = openBox(state);
      if (found) { await game.save(state); target.send({ type: 'boxOpened', item: found }); await tick(true); }
    } else if (m.type === 'chooseEvolution' && typeof m.id === 'string' && typeof m.choice === 'string') {
      const r = chooseEvolution(state, m.id, m.choice);
      if (r.ok) { lastEvolveTry = 0; await game.save(state); await tick(true); }
      else { void vscode.window.showWarningMessage(t(r.reason === 'item' ? 'branch.item' : 'branch.invalid')); }
    } else if (m.type === 'useItem' && typeof m.id === 'string' && isItemId(m.item)) {
      const ok = m.item === 'rare-candy' ? useRareCandy(state, m.id) : m.item === 'lucky-egg' ? useLuckyEgg(state, m.id) : false;
      if (ok) { await game.save(state); await tick(true); }
    } else if (m.type === 'transform' && typeof m.id === 'string' && isItemId(m.item)) {
      await transform(m.id, m.item);
    } else if (m.type === 'equip' && typeof m.id === 'string' && typeof m.item === 'string') {
      if (equipHeld(state, m.id, m.item)) { await game.save(state); await tick(true); }
    } else if (m.type === 'unequip' && typeof m.id === 'string') {
      if (unequipHeld(state, m.id)) { await game.save(state); await tick(true); }
    } else if (m.type === 'setFighter' && typeof m.id === 'string') {
      if (setFighter(state, m.id)) { await game.save(state); await tick(true); }
    } else if (from === 'album' && typeof m.type === 'string' && m.type.startsWith('league')) {
      await league.handle(m as { type: string });
    } else if (m.type === 'startBattle' && typeof m.leader === 'string') {
      await startBattle(m.leader);
    } else if (m.type === 'protect' && typeof m.id === 'string' && PROTECTORS.includes(m.item as Protector)) {
      if (protect(state, m.id, m.item as Protector)) { await game.save(state); await tick(true); }
    } else if (m.type === 'dry' && typeof m.id === 'string') {
      if (dryCard(state, m.id)) { await game.save(state); await tick(true); }
    } else if (m.type === 'grade' && typeof m.id === 'string') {
      const r = sendToGrading(state, m.id, usage.lifetimeTokens());
      if (r.ok) { await game.save(state); await tick(true); }
      else { void vscode.window.showWarningMessage(t(`grade.${r.reason}` as 'grade.coins')); }
    } else if (m.type === 'cancelGrade' && typeof m.id === 'string') {
      const fee = state.collection[m.id]?.grading?.cost;
      if (fee !== undefined && await vscode.window.showWarningMessage(t('grade.cancelConfirm', cancelRefund(fee), fee), { modal: true }, t('grade.cancelButton')) === t('grade.cancelButton')
          && cancelGrading(state, m.id) !== undefined) { await game.save(state); await tick(true); }
    } else if (m.type === 'high' && typeof m.id === 'string') {
      const card = state.collection[m.id]?.card;
      const file = card && await tcg.image(card, 'high');
      const src = file && target.uri(file); // each webview generates its own URIs
      if (src) { target.send({ type: 'high', id: m.id, src }); }
      if (card) { void refreshCard(m.id); }  // looking at a card brings its market price up to date
    }
  }

  /** Mega / VMAX / VSTAR / Terastal: looks the new card up first so the item is only spent when it exists. */
  async function transform(key: string, item: string): Promise<void> {
    const kind = TRANSFORM_BY_ITEM[item as keyof typeof TRANSFORM_BY_ITEM];
    const owned = state?.collection[key];
    if (!state || !kind || !owned || !isItemId(item) || countOf(state, item) < 1
      || owned.soaked || !canTransform(owned.card, { mastered: owned.mastered, level: levelOf(owned.xp) }, kind)) {
      void vscode.window.showWarningMessage(t('transform.invalid', MIN_TRANSFORM_LEVEL));
      return;
    }
    const r = await tcg.findTransform(owned.card, kind);
    if (!r.ok) { void vscode.window.showWarningMessage(t('transform.offline')); return; }
    if (!r.card) { void vscode.window.showInformationMessage(t('transform.none', owned.card.name, t(`transform.kind.${kind}`))); return; }
    const nk = applyTransform(state, key, item, r.card);
    if (!nk) { return; }
    await game.save(state);
    void vscode.window.showInformationMessage(t('transform.done', owned.card.name, r.card.name));
    await tick(true);
  }

  /** The fighter as the battle screen needs it: names, stats, the strength breakdown and the card art. */
  async function fighterView(f: Fighter, card: Card, download: boolean) {
    // The panel refreshes constantly, so it only uses art that is already on disk (large if there, otherwise the thumbnail);
    // the fight itself, started by the player, is allowed to download the large one.
    const quality = download || tcg.cachedImage(card, 'high') ? 'high' : 'low';
    const view = await cardView(card, quality, download, p => album.uri(p));
    return {
      care: view.care, wear: view.wear, wearRisk: view.wearRisk, grade: view.grade, held: view.held,
      name: f.name, key: f.key, level: f.level, hp: f.hp, atk: f.atk, def: f.def, spd: f.spd, types: f.types, strength: f.strength, moves: f.moves.map(m => m.name),
      src: view.src, tier: card.tier, variant: card.variant, rarity: card.rarity,
    };
  }

  /** Looks the eight gym aces up in the background (the first time they need the network) and repaints when done. */
  function fetchLeaders(): void {
    if (fetchingLeaders) { return; }
    fetchingLeaders = true;
    void (async () => {
      let changed = false;
      try {
        const elite = state && LEADERS.every(l => battleOf(state!).badges.includes(l.id)) ? ELITE.flatMap(eliteCards) : [];   // only once the Elite Four are open
        for (const d of [...LEADERS, bossOfWeek(Date.now()), ...(state?.stolen?.length ? [ROCKET] : []), ...elite]) {
          const card = await tcg.leaderCard(d.id, d.species);
          if (card && !tcg.cachedImage(card, 'low')) { await tcg.image(card, 'low'); changed = true; }
        }
      } finally { fetchingLeaders = false; }
      if (changed) { void tick(true); }
    })();
  }

  /** Everything the combat tab shows: your fighter, the record and the ladder with the odds against each leader. */
  async function battleData(s: GameState) {
    const rec = battleOf(s);
    const me = playerFighter(s, lastQuotaPct);
    const own = s.fighter ? s.collection[s.fighter] : undefined;
    const leaders = await Promise.all(LEADERS.map(async (d, i) => {
      const card = await tcg.cachedLeaderCard(d.id);
      const foe = card ? leaderFighter(d, card) : undefined;
      const art = card ? tcg.cachedImage(card, 'low') : undefined;
      return {
        id: d.id, name: d.name, species: d.species, level: d.level, reward: d.reward, rematch: d.rematch,
        unlocked: leaderUnlocked(s, i), earned: rec.badges.includes(d.id),
        card: card ? card.name : undefined, src: art ? album.uri(art) : undefined, types: foe?.types ?? [],
        strength: foe?.strength.total,
        odds: me.ok && foe ? estimateWin(me.fighter, foe, 200, i + 1) : undefined,
        edge: me.ok && foe ? (effectiveness(me.fighter, foe).eff === 'weak' ? 'me' : effectiveness(foe, me.fighter).eff === 'weak' ? 'foe' : undefined) : undefined,
      };
    }));
    const now = Date.now();
    const bs = bossStatus(s, now);
    const bossCard = await tcg.cachedLeaderCard(bs.def.id);
    const bossFoe = bossCard ? leaderFighter(bs.def, bossCard) : undefined;
    const bossArt = bossCard ? tcg.cachedImage(bossCard, 'low') : undefined;
    const keys = teamKeys(s);
    const mineTeam = keys.map(k => playerFighter(s, lastQuotaPct, k)).flatMap(r => (r.ok ? [r.fighter] : []));
    const elite = await Promise.all(ELITE.map(async (tr, i) => {
      const defs = eliteCards(tr);
      const cards = await Promise.all(defs.map(d => tcg.cachedLeaderCard(d.id)));
      const foes = cards.every(Boolean) ? defs.map((d, j) => leaderFighter(d, cards[j]!)) : [];
      const unlocked = eliteUnlocked(s, i);
      return {
        id: tr.id, name: tr.name, unlocked, beaten: eliteBeaten(s).includes(tr.id), reward: tr.reward,
        cards: defs.map((d, j) => { const art = cards[j] ? tcg.cachedImage(cards[j]!, 'low') : undefined; return { name: d.species, level: d.level, src: art ? album.uri(art) : undefined, types: foes[j]?.types ?? [] }; }),
        odds: unlocked && foes.length === TEAM_SIZE && mineTeam.length === TEAM_SIZE ? estimateTeamWin(mineTeam, foes, 40, 31 + i) : undefined,
      };
    }));
    const today = dayKey(now);
    const rocketCard = s.stolen?.length ? await tcg.cachedLeaderCard(ROCKET.id) : undefined;
    const rocketFoe = rocketCard ? leaderFighter(ROCKET, rocketCard) : undefined;
    const rocketArt = rocketCard ? tcg.cachedImage(rocketCard, 'low') : undefined;
    return {
      fighter: own && me.ok ? await fighterView(me.fighter, own.card, false) : null,
      fighterBlocked: me.ok ? undefined : me.reason,
      fighterTraining: !!s.fighter && s.slots.some(t => t && keyOf(t.card) === s.fighter),
      record: { wins: rec.wins, losses: rec.losses, streak: rec.streak, best: rec.best, badges: rec.badges },
      rewardsLeft: rec.daily.day === today ? Math.max(0, REMATCH_DAILY_CAP - rec.daily.rewarded) : REMATCH_DAILY_CAP,
      history: rec.history,
      boss: {
        id: bs.def.id, name: bs.def.name, level: bs.def.level, attemptsLeft: bs.attemptsLeft, attempts: BOSS_ATTEMPTS, won: bs.won, reward: BOSS_REWARD,
        card: bossCard?.name, src: bossArt ? album.uri(bossArt) : undefined, types: bossFoe?.types ?? [],
        odds: me.ok && bossFoe ? estimateWin(me.fighter, bossFoe, 200, 21) : undefined,
      },
      elite, team: { size: keys.length, need: TEAM_SIZE, names: keys.map(k => s.collection[k].card.name) },
      cup: { fee: CUP_FEE, rounds: CUP_ROUNDS, prize: CUP_PRIZE, played: cupPlayedToday(s, now), canPay: s.coins >= CUP_FEE },
      leaders,
      rocket: s.stolen?.length ? {
        id: ROCKET.id, name: ROCKET.name, species: ROCKET.species, level: ROCKET.level, stolen: s.stolen.map(o => o.card.name),
        card: rocketCard?.name, src: rocketArt ? album.uri(rocketArt) : undefined, types: rocketFoe?.types ?? [],
        odds: me.ok && rocketFoe ? estimateWin(me.fighter, rocketFoe, 200, 9) : undefined,
      } : undefined,
    };
  }

  /** One battle against a gym leader: simulate, record, pay and send the whole fight to the screen to be played back. */
  async function startBattle(leaderId: string): Promise<void> {
    const rocket = leaderId === ROCKET.id;
    const boss = leaderId.startsWith('boss:');
    const def = rocket ? ROCKET : boss ? bossOfWeek(Date.now()) : LEADER_BY_ID[leaderId];
    if (!state || !def || (boss && def.id !== leaderId)) { return; }
    if (boss) { if (!bossStatus(state, Date.now()).attemptsLeft) { void vscode.window.showWarningMessage(t('boss.noAttempts')); return; } }
    else if (rocket ? !state.stolen?.length : !leaderUnlocked(state, LEADERS.indexOf(def))) { void vscode.window.showWarningMessage(t(rocket ? 'rocket.none' : 'battle.locked')); return; }
    const me = playerFighter(state, lastQuotaPct);
    if (!me.ok) { void vscode.window.showWarningMessage(t(me.reason === 'grading' ? 'battle.grading' : me.reason === 'soaked' ? 'battle.soaked' : 'battle.noFighter')); return; }
    const card = await tcg.leaderCard(def.id, def.species);
    if (!card) { void vscode.window.showWarningMessage(t('battle.offline')); return; }
    const foe = leaderFighter(def, card);
    const own = state.collection[state.fighter!].card;
    const odds = estimateWin(me.fighter, foe, 400, 99);
    const result = simulate(me.fighter, foe, (Math.random() * 4294967296) >>> 0);
    const won = result.winner === 'a';
    const rocketFight = rocket ? recordRocketBattle(state, me.fighter.name, won, result.rounds) : null;
    const outcome = rocketFight
      ? { coins: 0, firstWin: false, capped: false, xp: rocketFight.xp, levelUp: rocketFight.levelUp, recovered: rocketFight.card?.name }
      : boss ? recordBossBattle(state, def, me.fighter.name, won, result.rounds)
        : recordBattle(state, def, me.fighter.name, won, result.rounds);
    const worn = applyWear(state, state.fighter!, Math.random);   // the card that fought may lose condition
    await game.save(state);
    album.send({
      type: 'battleResult',
      data: {
        leader: { id: def.id, name: def.name, level: def.level, kind: boss ? 'boss' : undefined },
        me: await fighterView(me.fighter, state.collection[state.fighter!].card, true), foe: await fighterView(foe, card, true),
        odds, won, rounds: result.rounds, reason: result.reason, log: result.log, outcome, worn,
        gaps: factorGaps(me.fighter, foe).slice(0, 3),
        typeEdge: effectiveness(me.fighter, foe).eff === 'weak' ? 'me' : effectiveness(foe, me.fighter).eff === 'weak' ? 'foe' : undefined,
      },
    });
    await tick(true);
  }

  /** The daily cup: three fights in a row against rivals a bit stronger than your card; the fee is paid up front, the prize by rounds won. */
  async function startCup(): Promise<void> {
    if (!state) { return; }
    const me = playerFighter(state, lastQuotaPct);
    if (!me.ok) { void vscode.window.showWarningMessage(t(me.reason === 'grading' ? 'battle.grading' : me.reason === 'soaked' ? 'battle.soaked' : 'battle.noFighter')); return; }
    const now = Date.now();
    if (cupPlayedToday(state, now)) { void vscode.window.showWarningMessage(t('cup.played')); return; }
    if (state.coins < CUP_FEE) { void vscode.window.showWarningMessage(t('cup.noCoins', CUP_FEE)); return; }
    // The rivals' cards are fetched before anything is charged: offline, the cup simply does not start.
    const rivals = cupRivals(me.fighter.level);
    const cards: Card[] = [];
    for (const r of rivals) {
      const c = await tcg.leaderCard(r.id, r.species);
      if (!c) { void vscode.window.showWarningMessage(t('battle.offline')); return; }
      cards.push(c);
    }
    if (!enterCup(state, now).ok) { return; }
    const mine = await fighterView(me.fighter, state.collection[state.fighter!].card, true);
    const rounds: unknown[] = [];
    let wins = 0;
    for (let i = 0; i < rivals.length; i++) {
      const foe = leaderFighter(rivals[i], cards[i]);
      const odds = estimateWin(me.fighter, foe, 200, 50 + i);
      const result = simulate(me.fighter, foe, (Math.random() * 4294967296) >>> 0);
      const won = result.winner === 'a';
      const { xp, levelUp } = recordCupRound(state, rivals[i], me.fighter.name, won, result.rounds, now);
      if (won) { wins++; }
      const last = !won || i === rivals.length - 1;
      rounds.push({
        leader: { id: rivals[i].id, name: rivals[i].name, level: rivals[i].level, kind: 'cup' }, cup: { round: i + 1, of: rivals.length },
        me: mine, foe: await fighterView(foe, cards[i], true), odds, won, rounds: result.rounds, reason: result.reason, log: result.log,
        outcome: { coins: 0, firstWin: false, capped: false, xp, ...(levelUp ? { levelUp } : {}) },
        gaps: factorGaps(me.fighter, foe).slice(0, 3),
        typeEdge: effectiveness(me.fighter, foe).eff === 'weak' ? 'me' : effectiveness(foe, me.fighter).eff === 'weak' ? 'foe' : undefined,
        ...(last ? { cupSummary: { wins, fee: CUP_FEE, ...finishCup(state, wins) } } : {}),
      });
      if (!won) { break; }
    }
    (rounds[rounds.length - 1] as { worn?: number }).worn = applyWear(state, state.fighter!, Math.random);   // once, after the whole cup
    await game.save(state);
    album.send({ type: 'cupResult', rounds });
    await tick(true);
  }

  /** An Elite Four trainer: your team of three against theirs, a series of 1v1 duels where the winner keeps its HP. */
  async function startElite(id: string): Promise<void> {
    const tr = ELITE_BY_ID[id];
    if (!state || !tr) { return; }
    if (!eliteUnlocked(state, ELITE.indexOf(tr))) { void vscode.window.showWarningMessage(t('elite.locked')); return; }
    const keys = teamKeys(state);
    const mine = keys.map(k => playerFighter(state!, lastQuotaPct, k)).flatMap(r => (r.ok ? [r.fighter] : []));
    if (mine.length < TEAM_SIZE) { void vscode.window.showWarningMessage(t('elite.team')); return; }
    const defs = eliteCards(tr);
    const cards: Card[] = [];
    for (const d of defs) {
      const c = await tcg.leaderCard(d.id, d.species);
      if (!c) { void vscode.window.showWarningMessage(t('battle.offline')); return; }
      cards.push(c);
    }
    const foes = defs.map((d, i) => leaderFighter(d, cards[i]));
    const result = simulateTeam(mine, foes, (Math.random() * 4294967296) >>> 0);
    const won = result.winner === 'a';
    const outcome = recordEliteBattle(state, tr, mine[0].name, won, result.duels.length);
    for (const k of keys.slice(1)) { const o = state.collection[k]; if (o && outcome.xp) { o.xp += Math.floor(outcome.xp / 2); } }   // the backup cards learn too, half as much
    const worn = applyWear(state, keys[0], Math.random);
    for (const k of keys.slice(1)) { applyWear(state, k, Math.random); }
    await game.save(state);
    const rounds: unknown[] = [];
    for (let i = 0; i < result.duels.length; i++) {
      const d = result.duels[i];
      const last = i === result.duels.length - 1;
      rounds.push({
        leader: { id: 'elite:' + tr.id, name: tr.name, level: defs[d.b].level, kind: 'elite' }, elite: { duel: i + 1, last, aliveA: result.aliveA, aliveB: result.aliveB },
        me: await fighterView(mine[d.a], state.collection[keys[d.a]].card, true), foe: await fighterView(foes[d.b], cards[d.b], true),
        odds: estimateWin(mine[d.a], foes[d.b], 100, 70 + i), won: d.result.winner === 'a', rounds: d.result.rounds, reason: d.result.reason, log: d.result.log,
        outcome: last ? outcome : { coins: 0, firstWin: false, capped: false, xp: 0 },
        gaps: factorGaps(mine[d.a], foes[d.b]).slice(0, 3),
        typeEdge: effectiveness(mine[d.a], foes[d.b]).eff === 'weak' ? 'me' : effectiveness(foes[d.b], mine[d.a]).eff === 'weak' ? 'foe' : undefined,
        ...(last ? { eliteSummary: { won, alive: result.aliveA, outcome }, worn } : {}),
      });
    }
    album.send({ type: 'cupResult', rounds });
    await tick(true);
  }

  async function openPack(kind: PackKind): Promise<void> {
    const stock = state && (kind === 'pack' ? state.packs : kind === 'premium' ? state.premium : state.balls);
    if (!state || opening || !stock) { return; }
    opening = true;
    try {
      provider.send({ type: 'opening', kind });
      const cards = await tcg.rollPack(kind, state.luck);
      if (!cards.length) {
        provider.send({ type: 'openFailed' });
        void vscode.window.showWarningMessage(t('pack.openFailed'));
        return;
      }
      consume(state, kind);
      addCards(state, cards);
      await game.save(state);
      const views = await Promise.all(cards.map(c => cardView(c, 'high', true)));
      provider.send({ type: 'reveal', cards: views.map((v, i) => ({ ...v, isNew: state!.collection[keyOf(cards[i])].count === 1 })) });
      await tick(true);
    } finally { opening = false; }
  }

  /** Updates a card (attacks and price) in the collection and in the training slots. */
  function applyCard(key: string, card: Card): void {
    const o = state?.collection[key];
    if (o) { o.card = card; }
    for (const t of state?.slots ?? []) { if (t && keyOf(t.card) === key) { t.card = card; } }
  }

  async function refreshCard(key: string): Promise<void> {
    const card = state?.collection[key]?.card;
    if (!state || !card) { return; }
    const fresh = await tcg.enrich(card, true);
    if (fresh && fresh !== card) { applyCard(key, fresh); await game.save(state); void tick(true); }
  }

  /** Fills in, in the background, cards saved before attacks and prices were known (needed for their stats). */
  function enrichMissing(cards: Card[]): void {
    const missing = [...new Map(cards.map(c => [keyOf(c), c])).values()].filter(c => c.cv !== CARD_DATA_VERSION && !failedEnrich.has(c.id));
    if (!missing.length || enriching) { return; }
    enriching = true;
    void (async () => {
      let changed = false;
      try {
        for (let i = 0; i < missing.length; i += 4) {
          await Promise.all(missing.slice(i, i + 4).map(async c => {
            const fresh = await tcg.enrich(c);
            if (fresh) { applyCard(keyOf(c), fresh); changed = true; } else { failedEnrich.add(c.id); }
          }));
        }
      } finally { enriching = false; }
      if (changed && state) { await game.save(state); void tick(true); }
    })();
  }

  async function cardView(c: Card, q: 'low' | 'high', fetchIfMissing: boolean, toUri: (p: string) => string | undefined = p => provider.uri(p)) {
    const file = tcg.cachedImage(c, q) ?? (fetchIfMissing ? await tcg.image(c, q) : undefined);
    const owned = state?.collection[keyOf(c)];
    const xp = owned?.xp ?? 0;
    const lv = levelProgress(xp);
    const rawValue = marketValue(c);
    return {
      held: owned?.held, grade: owned?.grade, care: owned?.care ?? {}, wear: owned?.grade ? 0 : owned?.wear ?? 0, soaked: !!owned?.soaked, wearRisk: owned ? wearChance(owned) : 0, gradeMult: gradeMultiplier(owned?.grade), gradeCost: gradeCost(c.tier, owned?.tries ?? 0),
      grading: owned?.grading ? gradingProgress(owned.grading, usage.lifetimeTokens()) : undefined,
      ...(c.cv === CARD_DATA_VERSION ? {} : { basic: true }),   // no attacks or price yet: estimated stats
      stats: statsOf(c, xp), lvPct: lv ? lv.pct : 100, xp, mastered: !!owned?.mastered,
      transforms: owned?.mastered && !owned.soaked
        ? (['mega', 'vmax', 'vstar', 'tera'] as Transform[]).filter(k => canTransform(c, { mastered: true, level: levelOf(xp) }, k))
        : [],
      market: rawValue === undefined ? undefined : Math.round(rawValue * gradeMultiplier(owned?.grade) * conditionMultiplier(owned?.wear, owned?.grade, owned?.soaked) * 100) / 100, eur: c.price?.eur, usd: c.price?.usd, priceAt: c.priceAt, collector: collectorLabel(c),
      id: keyOf(c), name: c.name, rarity: c.rarity, tier: c.tier, stage: c.stage, hp: c.hp,
      types: c.types, set: c.set, era: c.era,   // era/variant/tier/collector are ids: the webview translates them
      variant: c.variant, sell: owned?.soaked ? 0 : sellValue(c),
      src: file ? toUri(file) : undefined,
    };
  }

  /** Data for the album tab: the whole collection with thumbnails (downloaded in the background). */
  async function albumData(s: GameState) {
    const owned = Object.values(s.collection);
    prefetchThumbs(owned.map(o => o.card));
    enrichMissing(owned.map(o => o.card));
    fetchLeaders();
    const cards = await Promise.all(owned.slice(0, 1000).map(async o => ({
      ...await cardView(o.card, 'low', false, p => album.uri(p)), count: o.count, firstAt: o.firstAt,
    })));
    return {
      lang: lang(), sound: cfg().get<boolean>('sound.enabled', false), items: s.items, boxes: s.boxes, coins: Math.floor(s.coins), fighterId: s.fighter, battle: await battleData(s), album: cards, unique: owned.length, total: owned.reduce((n, o) => n + o.count, 0), mastered: s.mastered,
      value: Math.round(owned.reduce((n, o) => n + (marketValue(o.card) ?? 0) * o.count * gradeMultiplier(o.grade) * conditionMultiplier(o.wear, o.grade, o.soaked), 0)),
      showcaseId: showcaseKey(s), showcasePinned: !!s.showcase && !!s.collection[s.showcase] && !s.collection[s.showcase].soaked,
      teamIds: teamKeys(s).slice(1), frame: s.cosmetics?.frame, frames: FRAMES.map(f => ({ id: f.id, price: f.price, owned: !!s.cosmetics?.owned.includes(f.id) })),
      goals: GOALS.map(g => ({ id: g.id, goal: g.goal, value: progressOf(s, g), reward: g.reward, done: s.goals?.[g.id] })),
      trainingIds: s.slots.flatMap(t => (t ? [keyOf(t.card)] : [])), freeSlots: s.slots.filter(t => t === null).length,
    };
  }

  /** Downloads the missing thumbnails in the background and repaints the panel when done. */
  function prefetchThumbs(cards: Card[]): void {
    const missing = [...new Map(cards.map(c => [c.id, c])).values()].filter(c => !tcg.cachedImage(c, 'low') && !failedThumbs.has(c.id));
    if (!missing.length || prefetching) { return; }
    prefetching = true;
    void (async () => {
      try {
        for (let i = 0; i < missing.length; i += 4) {
          await Promise.all(missing.slice(i, i + 4).map(async c => { if (!await tcg.image(c, 'low')) { failedThumbs.add(c.id); } }));
        }
      } finally { prefetching = false; }
      void tick(true);
    })();
  }

  /** A mishap is announced with a notification (the panel is rarely open) that leads to the album, where its effects show. */
  function announceMishap(m: MishapResult): void {
    const names = m.cards.map(c => (c.n > 1 ? `${c.name} ×${c.n}` : c.name)).join(', ');
    const lost = m.cards.reduce((n, c) => n + c.n, 0);
    const msg = m.kind === 'rocket' ? t('mishap.rocket', names)
      : m.kind === 'trip' ? t('mishap.trip', lost, names, m.worn ?? 0, m.sleevesLost ?? 0)
        : m.cards.length ? t('mishap.rain', m.cards.length, m.saved) : t('mishap.rainSaved', m.saved);
    log.appendLine(`[mishap] ${m.kind}: ${names || '-'}${m.saved ? ` (${m.saved} kept dry)` : ''}`);
    void vscode.window.showWarningMessage(msg, t('mishap.open')).then(a => { if (a) { album.show(); } });
  }

  async function alerts(period: number, pct: number): Promise<void> {
    const th = cfg().get<number[]>('alerts.thresholds', [50, 80, 100]).slice().sort((a, b) => a - b);
    const fired = game.alertedFor(period);
    const crossed = th.filter(t => pct >= t && !fired.includes(t));
    if (!crossed.length) { return; }
    await game.markAlerted(period, [...fired, ...crossed]);
    const top = crossed[crossed.length - 1];
    const msg = t('alert.quota', pct.toFixed(0), top);
    void (top >= 100 ? vscode.window.showErrorMessage(msg) : vscode.window.showWarningMessage(msg));
  }

  async function snapshot(unit: Unit, limit: number, usedNow: number, pct: number, agg: ReturnType<UsageStore['aggregate']>, s: GameState, lifetime: number, mult: number, every: number, events: string[], pace: boolean) {
    const shopItems: { id: Item; name: string; desc: string }[] = [
      { id: 'pack', name: t('shop.pack.name'), desc: t('shop.pack.desc') },
      { id: 'premium', name: t('shop.premium.name'), desc: t('shop.premium.desc') },
      { id: 'ball', name: t('shop.ball.name'), desc: t('shop.ball.desc') },
      { id: 'box', name: t('shop.box.name'), desc: t('shop.box.desc') },
      { id: 'sleeve', name: t('shop.sleeve.name'), desc: t('shop.sleeve.desc') },
      { id: 'toploader', name: t('shop.toploader.name'), desc: t('shop.toploader.desc') },
      { id: 'hair-dryer', name: t('shop.hair-dryer.name'), desc: t('shop.hair-dryer.desc') },
      { id: 'slot', name: t('shop.slot.name'), desc: t('shop.slot.desc', s.slots.length, MAX_SLOTS) },
      { id: 'luck', name: t('shop.luck.name'), desc: t('shop.luck.desc', s.luck, MAX_LUCK) },
    ];
    const shop = shopItems.map(i => ({ ...i, price: priceOf(s, i.id) }));
    const b = (x: { input: number; cached: number; output: number; credits: number }) => ({ ...x, total: totalOf(x) });
    const slots = await Promise.all(s.slots.map(async t => {
      if (!t) { return null; }
      const p = trainingProgress(t, lifetime, mult);
      return { card: await cardView(t.card, 'high', true), id: keyOf(t.card), pct: p.pct, into: p.into, span: p.span, evolved: t.evolved, mastered: !!t.mastered, boost: t.boost ?? 0,
        branches: t.pending ? branchOptions(t).map(o => ({ name: o.name, item: o.item, have: !o.item || countOf(s, o.item) > 0 })) : undefined };
    }));
    enrichMissing(s.slots.flatMap(t => (t ? [t.card] : [])));
    const owned = Object.values(s.collection);
    const newest = owned.sort((a, c) => c.firstAt - a.firstAt).slice(0, 3).map(o => o.card);
    prefetchThumbs(newest);
    const recent = await Promise.all(newest.map(c => cardView(c, 'low', false)));
    return {
      lang: lang(), unit, limit, used: usedNow, pct, events,
      today: b(agg.today), month: b(agg.month),
      byModel: Object.entries(agg.byModel).map(([k, v]) => ({ name: k, ...b(v) })).sort((a, c) => c.total - a.total),
      daily: agg.daily,
      boxes: s.boxes, items: s.items, packs: s.packs, premium: s.premium, balls: s.balls, nextPack: nextPackProgress(s, lifetime, every),
      coins: Math.floor(s.coins), pace, shop, perDay: usage.tokensSince(Date.now() - 7 * 864e5) / 7,
      sound: cfg().get<boolean>('sound.enabled', false), tour: s.tour !== false, recap: recapView(s), fighter: !!s.fighter, goalsDone: GOALS.filter(g => s.goals?.[g.id]).length, goalsTotal: GOALS.length,
      slots, recent, albumUnique: owned.length, albumTotal: owned.reduce((n, o) => n + o.count, 0), mastered: s.mastered,
    };
  }

  // Duels other players started while the album was closed: looked for at start-up and every 10 minutes (only if signed in).
  const leaguePoll = setInterval(() => void league.poll(), 10 * 60_000);
  setTimeout(() => void league.poll(), 20_000);

  ctx.subscriptions.push(
    bar, packBar, log,
    vscode.window.registerWebviewViewProvider(BinderViewProvider.viewType, provider),
    vscode.commands.registerCommand('tokenBinder.open', () => vscode.commands.executeCommand('workbench.view.extension.tokenBinder')),
    vscode.commands.registerCommand('tokenBinder.refresh', () => tick(true)),
    vscode.commands.registerCommand('tokenBinder.checkForUpdates', () => updater.check(true)),
    vscode.commands.registerCommand('tokenBinder.openAlbum', () => album.show()),
    vscode.commands.registerCommand('tokenBinder.deleteOnlineData', async () => { if (await league.deleteData()) { void vscode.window.showInformationMessage(t('league.deleted')); } }),
    { dispose: () => clearInterval(leaguePoll) },
    vscode.commands.registerCommand('tokenBinder.setQuota', async () => {
      const c = cfg();
      const unit = await vscode.window.showQuickPick(
        [{ label: 'tokens', description: t('quota.unit.tokens') }, { label: 'credits', description: t('quota.unit.credits') }],
        { title: t('quota.unit.title'), placeHolder: t('quota.unit.current', String(c.get('quota.unit'))) });
      if (!unit) { return; }
      const raw = await vscode.window.showInputBox({
        title: t('quota.title'),
        prompt: t('quota.prompt', unit.label),
        value: String(c.get('quota.monthlyLimit')),
        validateInput: v => (parseLimit(v) ? undefined : t('quota.invalid')),
      });
      if (raw === undefined) { return; }
      await c.update('quota.unit', unit.label, vscode.ConfigurationTarget.Global);
      await c.update('quota.monthlyLimit', parseLimit(raw), vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage(t('quota.set', fmt(parseLimit(raw)!), unit.label));
    }),
    vscode.commands.registerCommand('tokenBinder.exportProgress', async (): Promise<boolean> => {
      if (!state) { return false; }
      const file = await vscode.window.showSaveDialog({ title: t('export.title'), filters: { JSON: ['json'] }, defaultUri: vscode.Uri.file(path.join(require('os').homedir(), 'tokenbinder-progress.json')) });
      if (!file) { return false; }
      const payload = exportPayload(state, version);
      await vscode.workspace.fs.writeFile(file, Buffer.from(JSON.stringify(payload, null, 2), 'utf8'));
      void vscode.window.showInformationMessage(t('export.done', Object.keys(state.collection).length, Math.floor(state.coins)));
      return true;
    }),
    vscode.commands.registerCommand('tokenBinder.resetProgress', async () => {
      if (!state) { return; }
      const n = Object.keys(state.collection).length;
      const choice = await vscode.window.showWarningMessage(
        t('reset.confirm', n, Math.floor(state.coins)),
        { modal: true }, t('reset.exportFirst'), t('reset.noCopy'));
      if (!choice) { return; }
      if (choice === t('reset.exportFirst')) {
        const saved = await vscode.commands.executeCommand<boolean>('tokenBinder.exportProgress');
        if (!saved) { return; } // the save was cancelled: nothing is reset
      }
      state = newState(usage.lifetimeTokens());
      await game.save(state);
      await tick(true);
      void vscode.window.showInformationMessage(t('reset.done'));
    }),
    vscode.commands.registerCommand('tokenBinder.importProgress', async () => {
      const pick = await vscode.window.showOpenDialog({ title: t('import.title'), filters: { JSON: ['json'] }, canSelectMany: false });
      if (!pick?.length) { return; }
      let imported: GameState;
      try {
        const parsed = parseImport(JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(pick[0])).toString('utf8')));
        if (!parsed.ok) {
          void vscode.window.showErrorMessage(t(parsed.reason === 'tooNew' ? 'import.tooNew' : 'import.invalid'));
          return;
        }
        imported = normalize(parsed.game, usage.lifetimeTokens());
      } catch {
        void vscode.window.showErrorMessage(t('import.invalid'));
        return;
      }
      const ok = await vscode.window.showWarningMessage(
        t('import.confirm', Object.keys(imported.collection).length, Math.floor(imported.coins)), { modal: true }, t('import.replace'));
      if (ok !== t('import.replace')) { return; }
      // Tokens already used on this machine must not give coins or packs again.
      imported.metric = 2;   // baseline and lastLifetime are set on the current scale just below
      imported.lastLifetime = usage.lifetimeTokens();
      imported.baseline = usage.lifetimeTokens() - imported.packsGranted * cfg().get<number>('packs.everyTokens', 750_000);
      state = imported;
      await game.save(state);
      await tick(true);
      void vscode.window.showInformationMessage(t('import.done'));
    }),
    vscode.commands.registerCommand('tokenBinder.openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', 'tokenBinder')),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('tokenBinder')) { applyLanguage(); void tick(true); } }),
  );

  // Watchers (folders outside the workspace via an absolute RelativePattern) + fallback polling.
  let timer: NodeJS.Timeout | undefined;
  const debounced = () => { clearTimeout(timer); timer = setTimeout(() => void tick(), 1000); };
  const watch = (base: string, glob: string) => {
    const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(base), glob));
    w.onDidChange(debounced); w.onDidCreate(debounced); w.onDidDelete(debounced);
    ctx.subscriptions.push(w);
  };
  for (const r of roots()) {
    watch(path.join(r, 'workspaceStorage'), '*/chatSessions/*');           // previous format (.jsonl / .json)
    watch(path.join(path.dirname(r), 'agentSessionData'), '*/session.db*'); // agent host (SQLite + -wal)
  }
  const poll = setInterval(() => void tick(), 15_000);
  ctx.subscriptions.push({ dispose: () => { clearInterval(poll); clearTimeout(timer); } });

  void tick(true);
  updater.start();
  // Private, git-ignored testing tools plug in here; the public source registers nothing.
  registerDevTools({ ctx, getState: () => state, lifetime: () => usage.lifetimeTokens(), growth: () => cfg().get<number>('growth.multiplier', 1),
    save: () => (state ? game.save(state) : Promise.resolve()), refresh: () => tick(true), announceMishap });
  // Settings from the old version and the prompt to remove it (does not block startup).
  void migrateLegacySettings(s => log.appendLine(s)).then(() => offerUninstallLegacy());
}

function renderBar(bar: vscode.StatusBarItem, unit: Unit, usedNow: number, pct: number, today: any, month: any, byModel: Record<string, any>): void {
  bar.text = `$(flame) ${fmt(usedNow)}${unit === 'credits' ? ' cr' : ''} · ${pct.toFixed(0)}%`;
  bar.backgroundColor = pct >= 100 ? new vscode.ThemeColor('statusBarItem.errorBackground')
    : pct >= 80 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = { enabledCommands: ['tokenBinder.setQuota', 'tokenBinder.open'] };
  md.appendMarkdown(t('bar.tooltip.title', pct.toFixed(1)) + '\n\n');
  md.appendMarkdown(t('bar.tooltip.usage', fmt(totalOf(today)), fmt(totalOf(month))) + '\n\n');
  const rows = (o: Record<string, any>) => Object.entries(o).sort(([, a], [, b]) => totalOf(b) - totalOf(a)).slice(0, 6).map(([k, v]) => `- ${k}: ${fmt(totalOf(v))}`).join('\n');
  md.appendMarkdown(`${t('bar.tooltip.byModel')}\n${rows(byModel) || t('bar.tooltip.noData')}\n\n${t('bar.tooltip.links')}`);
  bar.tooltip = md;
}

function renderPackBar(item: vscode.StatusBarItem, s: GameState): void {
  const n = s.packs + s.premium + s.balls;
  if (!n) { item.hide(); return; }
  item.text = `$(gift) ${n}`;
  item.tooltip = t(n === 1 ? 'packbar.one' : 'packbar.many', n, s.packs, s.premium, s.balls);
  item.show();
}

export function deactivate(): void { /* disposables live in ctx.subscriptions */ }
