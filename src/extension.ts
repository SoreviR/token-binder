import * as vscode from 'vscode';
import * as path from 'path';
import { UsageStore, totalOf } from './usage/store';
import { defaultRoots, runningUserRoot, uniqueRoots } from './usage/paths';
import { fmt, parseLimit, percent, periodEnd, periodStart, used, Unit } from './quota';
import { GameStore } from './game/state';
import {
  accrueXp, addCards, applyTransform, branchOptions, buy, CARD_DATA_VERSION, Card, chooseEvolution, consume, countOf, earnCoins, GameState, levelOf, openBox,
  useLuckyEgg, useRareCandy, grantPacks, Item, keyOf, levelProgress, MAX_LUCK, MAX_SLOTS,
  newState, nextPackProgress, normalize, PackKind, priceOf, resolveDue, sellDuplicates, sellValue, startTraining, trainingProgress, underPace,
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
import { PROTECTORS, Protector, gradeCost, gradeMultiplier, gradingProgress, protect, resolveGrading, sendToGrading } from './game/grading';

const cfg = () => vscode.workspace.getConfiguration('tokenBinder');

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
  let state: GameState | undefined;
  let busy = false;
  let opening = false;
  let lastLogged = '';
  let lastEvolveTry = 0;
  let prefetching = false;
  const failedThumbs = new Set<string>(); // do not retry in a loop when offline; cleared on reload
  const failedEnrich = new Set<string>();
  let enriching = false;

  let rerun = false;
  async function tick(force = false): Promise<void> {
    if (busy) { rerun = rerun || force; return; } // do not lose a refresh requested while we are busy
    busy = true;
    try {
      const changed = usage.refresh();
      if (usage.stampsDirty) { usage.stampsDirty = false; await ctx.globalState.update('tokenBinder.stamps.v1', usage.stamps); }
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
      const lifetime = usage.lifetimeTokens();

      state ??= game.load(lifetime);
      const events: string[] = [];
      const every = cfg().get<number>('packs.everyTokens', 750_000);
      const granted = grantPacks(state, lifetime, every);
      if (granted) { events.push(`packs:${granted}`); }
      const resetDay = cfg().get<number>('quota.resetDay', 1);
      const pace = underPace(pct, now, start, periodEnd(now, resetDay));
      earnCoins(state, lifetime, pace);
      if (pct >= 100 && state.bonusPeriod !== start) { state.bonusPeriod = start; state.packs++; events.push('bonusPack'); }
      events.push(...accrueXp(state, lifetime));
      events.push(...resolveGrading(state, lifetime));
      // Evolution/graduation: needs the network; if it fails it is retried at most every 30 s.
      const due = state.slots.some(t => t && trainingProgress(t, lifetime, mult).due);
      if (due && now - lastEvolveTry > 30_000) {
        lastEvolveTry = now;
        try { events.push(...await resolveDue(state, lifetime, mult, tcg.findNext)); } catch (e) { log.appendLine(`[error] evolution: ${e}`); }
      }
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
    if (m.type === 'openAlbum') { album.show(); }
    else if (m.type === 'openPack') { await openPack(m.kind === 'premium' || m.kind === 'ball' ? m.kind : 'pack'); }
    else if (m.type === 'buy' && typeof m.item === 'string') {
      if (buy(state, m.item as Item)) { await game.save(state); await tick(true); }
    } else if (m.type === 'sell' && typeof m.id === 'string') {
      const earned = sellDuplicates(state, m.id);
      if (earned) { await game.save(state); await tick(true); }
    } else if (m.type === 'sellAll') {
      const n = Object.values(state.collection).reduce((s, o) => s + Math.max(0, o.count - 1), 0);
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
    } else if (m.type === 'protect' && typeof m.id === 'string' && PROTECTORS.includes(m.item as Protector)) {
      if (protect(state, m.id, m.item as Protector)) { await game.save(state); await tick(true); }
    } else if (m.type === 'grade' && typeof m.id === 'string') {
      const r = sendToGrading(state, m.id, usage.lifetimeTokens());
      if (r.ok) { await game.save(state); await tick(true); }
      else { void vscode.window.showWarningMessage(t(`grade.${r.reason}` as 'grade.coins')); }
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
      || !canTransform(owned.card, { mastered: owned.mastered, level: levelOf(owned.xp) }, kind)) {
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
      grade: owned?.grade, care: owned?.care ?? {}, gradeMult: gradeMultiplier(owned?.grade), gradeCost: gradeCost(c.tier, owned?.tries ?? 0),
      grading: owned?.grading ? gradingProgress(owned.grading, usage.lifetimeTokens()) : undefined,
      ...(c.cv === CARD_DATA_VERSION ? {} : { basic: true }),   // no attacks or price yet: estimated stats
      stats: statsOf(c, xp), lvPct: lv ? lv.pct : 100, xp, mastered: !!owned?.mastered,
      transforms: owned?.mastered
        ? (['mega', 'vmax', 'vstar', 'tera'] as Transform[]).filter(k => canTransform(c, { mastered: true, level: levelOf(xp) }, k))
        : [],
      market: rawValue === undefined ? undefined : Math.round(rawValue * gradeMultiplier(owned?.grade) * 100) / 100, eur: c.price?.eur, usd: c.price?.usd, priceAt: c.priceAt, collector: collectorLabel(c),
      id: keyOf(c), name: c.name, rarity: c.rarity, tier: c.tier, stage: c.stage, hp: c.hp,
      types: c.types, set: c.set, era: c.era,   // era/variant/tier/collector are ids: the webview translates them
      variant: c.variant, sell: sellValue(c),
      src: file ? toUri(file) : undefined,
    };
  }

  /** Data for the album tab: the whole collection with thumbnails (downloaded in the background). */
  async function albumData(s: GameState) {
    const owned = Object.values(s.collection);
    prefetchThumbs(owned.map(o => o.card));
    enrichMissing(owned.map(o => o.card));
    const cards = await Promise.all(owned.slice(0, 1000).map(async o => ({
      ...await cardView(o.card, 'low', false, p => album.uri(p)), count: o.count, firstAt: o.firstAt,
    })));
    return {
      lang: lang(), items: s.items, coins: Math.floor(s.coins), album: cards, unique: owned.length, total: owned.reduce((n, o) => n + o.count, 0), mastered: s.mastered,
      value: Math.round(owned.reduce((n, o) => n + (marketValue(o.card) ?? 0) * o.count * gradeMultiplier(o.grade), 0)),
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
      slots, recent, albumUnique: owned.length, albumTotal: owned.reduce((n, o) => n + o.count, 0), mastered: s.mastered,
    };
  }

  ctx.subscriptions.push(
    bar, packBar, log,
    vscode.window.registerWebviewViewProvider(BinderViewProvider.viewType, provider),
    vscode.commands.registerCommand('tokenBinder.open', () => vscode.commands.executeCommand('workbench.view.extension.tokenBinder')),
    vscode.commands.registerCommand('tokenBinder.refresh', () => tick(true)),
    vscode.commands.registerCommand('tokenBinder.checkForUpdates', () => updater.check(true)),
    vscode.commands.registerCommand('tokenBinder.openAlbum', () => album.show()),
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
    save: () => (state ? game.save(state) : Promise.resolve()), refresh: () => tick(true) });
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
