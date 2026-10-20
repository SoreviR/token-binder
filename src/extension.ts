import * as vscode from 'vscode';
import * as path from 'path';
import { UsageStore, totalOf } from './usage/store';
import { defaultRoots } from './usage/paths';
import { fmt, parseLimit, percent, periodEnd, periodStart, used, Unit } from './quota';
import { GameStore } from './game/state';
import {
  addCards, buy, Card, consume, earnCoins, GameState, grantPacks, Item, MAX_LUCK, MAX_SLOTS, nextPackProgress, PackKind, priceOf,
  resolveDue, startTraining, TIER_NAMES, trainingProgress, underPace,
} from './game/engine';
import { Tcgdex } from './game/tcgdex';
import { PokeViewProvider, WebviewMessage } from './webview/provider';
import { AlbumPanel } from './webview/albumPanel';
import { lastBackend } from './usage/sqlite';

const cfg = () => vscode.workspace.getConfiguration('pokeToken');

export function activate(ctx: vscode.ExtensionContext): void {
  const roots = () => { const r = cfg().get<string[]>('storageRoots', []); return r.length ? r : defaultRoots(); };
  const usage = new UsageStore(roots);
  usage.stamps = ctx.globalState.get('pokeToken.stamps.v1', usage.stamps);
  const log = vscode.window.createOutputChannel('PokeToken');
  const game = new GameStore(ctx.globalState);
  const cacheDir = path.join(ctx.globalStorageUri.fsPath, 'tcg');
  const tcg = new Tcgdex(cacheDir);

  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  bar.command = 'pokeToken.open';
  bar.show();
  // Sobres sin abrir: el panel casi nunca está visible, así que se avisa desde la barra de estado.
  const packBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  packBar.command = 'pokeToken.open';

  const provider = new PokeViewProvider(ctx.extensionUri, vscode.Uri.file(cacheDir), () => void tick(true), m => void onMessage(m, 'side'));
  const album = new AlbumPanel(ctx.extensionUri, vscode.Uri.file(cacheDir), () => void tick(true), m => void onMessage(m, 'album'));
  let state: GameState | undefined;
  let busy = false;
  let opening = false;
  let lastLogged = '';
  let lastEvolveTry = 0;
  let prefetching = false;
  const failedThumbs = new Set<string>(); // no reintentar en bucle si no hay red; se limpia al recargar

  let rerun = false;
  async function tick(force = false): Promise<void> {
    if (busy) { rerun = rerun || force; return; } // no perder un refresco pedido mientras trabajamos
    busy = true;
    try {
      const changed = usage.refresh();
      if (usage.stampsDirty) { usage.stampsDirty = false; await ctx.globalState.update('pokeToken.stamps.v1', usage.stamps); }
      if (usage.lastError && usage.lastError !== lastLogged) { lastLogged = usage.lastError; log.appendLine(`[error] ${usage.lastError}`); }
      if (changed) { log.appendLine(`[uso] ${usage.records().length} registros (${lastBackend})`); }
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
      // Evolución/graduación: necesita red; si falla se reintenta como mucho cada 30 s.
      const due = state.slots.some(t => t && trainingProgress(t, lifetime, mult).due);
      if (due && now - lastEvolveTry > 30_000) {
        lastEvolveTry = now;
        try { events.push(...await resolveDue(state, lifetime, mult, tcg.findNext)); } catch (e) { log.appendLine(`[error] evolución: ${e}`); }
      }
      await game.save(state);

      await alerts(start, pct);
      renderBar(bar, unit, usedNow, pct, agg.today, agg.month, agg.byModel, agg.byMode);
      renderPackBar(packBar, state);
      if (provider.visible) { provider.post(await snapshot(unit, limit, usedNow, pct, agg, state, lifetime, mult, every, events, pace)); }
      if (album.open) { album.post(await albumData(state)); }
    } finally {
      busy = false;
      if (rerun) { rerun = false; void tick(true); }
    }
  }

  /** Mensajes de los paneles: abrir sobre, comprar, entrenar, abrir el álbum, pedir la imagen grande. */
  async function onMessage(m: WebviewMessage, from: 'side' | 'album'): Promise<void> {
    if (!state) { return; }
    const target = from === 'album' ? album : provider;
    if (m.type === 'openAlbum') { album.show(); }
    else if (m.type === 'openPack') { await openPack(m.kind === 'premium' || m.kind === 'ball' ? m.kind : 'pack'); }
    else if (m.type === 'buy' && typeof m.item === 'string') {
      if (buy(state, m.item as Item)) { await game.save(state); await tick(true); }
    } else if (m.type === 'train' && typeof m.id === 'string') {
      if (startTraining(state, m.id, usage.lifetimeTokens())) { await game.save(state); await tick(true); }
    } else if (m.type === 'high' && typeof m.id === 'string') {
      const card = state.collection[m.id]?.card;
      const file = card && await tcg.image(card, 'high');
      const src = file && target.uri(file); // cada webview genera sus propias URI
      if (src) { target.send({ type: 'high', id: m.id, src }); }
    }
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
        void vscode.window.showWarningMessage('PokeToken: no se pudo abrir el sobre (¿sin conexión o red bloqueada a api.tcgdex.net?). No se gastó el sobre.');
        return;
      }
      consume(state, kind);
      addCards(state, cards);
      await game.save(state);
      const views = await Promise.all(cards.map(c => cardView(c, 'high', true)));
      provider.send({ type: 'reveal', cards: views.map((v, i) => ({ ...v, isNew: state!.collection[cards[i].id].count === 1 })) });
      await tick(true);
    } finally { opening = false; }
  }

  async function cardView(c: Card, q: 'low' | 'high', fetchIfMissing: boolean, toUri: (p: string) => string | undefined = p => provider.uri(p)) {
    const file = tcg.cachedImage(c, q) ?? (fetchIfMissing ? await tcg.image(c, q) : undefined);
    return {
      id: c.id, name: c.name, rarity: c.rarity, tier: c.tier, tierName: TIER_NAMES[c.tier], stage: c.stage, hp: c.hp,
      types: c.types, set: c.set, src: file ? toUri(file) : undefined,
    };
  }

  /** Datos de la pestaña del álbum: toda la colección con miniaturas (se descargan en segundo plano). */
  async function albumData(s: GameState) {
    const owned = Object.values(s.collection);
    prefetchThumbs(owned.map(o => o.card));
    const cards = await Promise.all(owned.slice(0, 1000).map(async o => ({
      ...await cardView(o.card, 'low', false, p => album.uri(p)), count: o.count, firstAt: o.firstAt,
    })));
    return {
      album: cards, unique: owned.length, total: owned.reduce((n, o) => n + o.count, 0), mastered: s.mastered,
      trainingIds: s.slots.flatMap(t => (t ? [t.card.id] : [])), freeSlots: s.slots.filter(t => t === null).length,
    };
  }

  /** Descarga en segundo plano las miniaturas que faltan y vuelve a pintar el panel al terminar. */
  function prefetchThumbs(cards: Card[]): void {
    const missing = cards.filter(c => !tcg.cachedImage(c, 'low') && !failedThumbs.has(c.id));
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
    const msg = `PokeToken: llevas ${pct.toFixed(0)}% del cupo mensual (umbral ${top}%).`;
    void (top >= 100 ? vscode.window.showErrorMessage(msg) : vscode.window.showWarningMessage(msg));
  }

  async function snapshot(unit: Unit, limit: number, usedNow: number, pct: number, agg: ReturnType<UsageStore['aggregate']>, s: GameState, lifetime: number, mult: number, every: number, events: string[], pace: boolean) {
    const shopItems: { id: Item; name: string; desc: string }[] = [
      { id: 'pack', name: 'Sobre', desc: '5 cartas' },
      { id: 'premium', name: 'Sobre premium', desc: '5 cartas, mejores rarezas' },
      { id: 'ball', name: 'Pokébola', desc: '1 carta' },
      { id: 'slot', name: 'Hueco de entrenamiento', desc: `${s.slots.length}/${MAX_SLOTS} · una carta más creciendo` },
      { id: 'luck', name: 'Mejora de suerte', desc: `nivel ${s.luck}/${MAX_LUCK} · +20 % a rarezas Holo o superiores por nivel` },
    ];
    const shop = shopItems.map(i => ({ ...i, price: priceOf(s, i.id) }));
    const b = (x: { input: number; cached: number; output: number; credits: number }) => ({ ...x, total: totalOf(x) });
    const slots = await Promise.all(s.slots.map(async t => {
      if (!t) { return null; }
      const p = trainingProgress(t, lifetime, mult);
      return { card: await cardView(t.card, 'high', true), pct: p.pct, into: p.into, span: p.span, evolved: t.evolved };
    }));
    const owned = Object.values(s.collection);
    const newest = owned.sort((a, c) => c.firstAt - a.firstAt).slice(0, 3).map(o => o.card);
    prefetchThumbs(newest);
    const recent = await Promise.all(newest.map(c => cardView(c, 'low', false)));
    return {
      unit, limit, used: usedNow, pct, events,
      today: b(agg.today), month: b(agg.month),
      byModel: Object.entries(agg.byModel).map(([k, v]) => ({ name: k, ...b(v) })).sort((a, c) => c.total - a.total),
      byMode: Object.entries(agg.byMode).map(([k, v]) => ({ name: k, ...b(v) })).sort((a, c) => c.total - a.total),
      daily: agg.daily,
      packs: s.packs, premium: s.premium, balls: s.balls, nextPack: nextPackProgress(s, lifetime, every),
      coins: Math.floor(s.coins), pace, shop,
      slots, recent, albumUnique: owned.length, albumTotal: owned.reduce((n, o) => n + o.count, 0), mastered: s.mastered,
    };
  }

  ctx.subscriptions.push(
    bar, packBar, log,
    vscode.window.registerWebviewViewProvider(PokeViewProvider.viewType, provider),
    vscode.commands.registerCommand('pokeToken.open', () => vscode.commands.executeCommand('workbench.view.extension.pokeToken')),
    vscode.commands.registerCommand('pokeToken.refresh', () => tick(true)),
    vscode.commands.registerCommand('pokeToken.openAlbum', () => album.show()),
    vscode.commands.registerCommand('pokeToken.setQuota', async () => {
      const c = cfg();
      const unit = await vscode.window.showQuickPick(
        [{ label: 'tokens', description: 'Cupo medido en tokens' }, { label: 'credits', description: 'Cupo medido en créditos de IA de Copilot' }],
        { title: 'PokeToken: unidad del cupo', placeHolder: `Actual: ${c.get('quota.unit')}` });
      if (!unit) { return; }
      const raw = await vscode.window.showInputBox({
        title: 'PokeToken: cupo mensual',
        prompt: `Tu cupo en ${unit.label}. Acepta sufijos K, M, B (ej. 5M = 5.000.000).`,
        value: String(c.get('quota.monthlyLimit')),
        validateInput: v => (parseLimit(v) ? undefined : 'Escribe un número mayor que 0, p. ej. 5000000 o 5M'),
      });
      if (raw === undefined) { return; }
      await c.update('quota.unit', unit.label, vscode.ConfigurationTarget.Global);
      await c.update('quota.monthlyLimit', parseLimit(raw), vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage(`PokeToken: cupo fijado en ${fmt(parseLimit(raw)!)} ${unit.label}.`);
    }),
    vscode.commands.registerCommand('pokeToken.openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', 'pokeToken')),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration('pokeToken')) { void tick(true); } }),
  );

  // Watcher (carpetas fuera del workspace via RelativePattern absoluto) + polling de respaldo.
  let timer: NodeJS.Timeout | undefined;
  const debounced = () => { clearTimeout(timer); timer = setTimeout(() => void tick(), 1000); };
  const watch = (base: string, glob: string) => {
    const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(base), glob));
    w.onDidChange(debounced); w.onDidCreate(debounced); w.onDidDelete(debounced);
    ctx.subscriptions.push(w);
  };
  for (const r of roots()) {
    watch(path.join(r, 'workspaceStorage'), '*/chatSessions/*');           // formato anterior (.jsonl / .json)
    watch(path.join(path.dirname(r), 'agentSessionData'), '*/session.db*'); // agent host (SQLite + -wal)
  }
  const poll = setInterval(() => void tick(), 15_000);
  ctx.subscriptions.push({ dispose: () => { clearInterval(poll); clearTimeout(timer); } });

  void tick(true);
}

function renderBar(bar: vscode.StatusBarItem, unit: Unit, usedNow: number, pct: number, today: any, month: any, byModel: Record<string, any>, byMode: Record<string, any>): void {
  bar.text = `$(flame) ${fmt(usedNow)}${unit === 'credits' ? ' cr' : ''} · ${pct.toFixed(0)}%`;
  bar.backgroundColor = pct >= 100 ? new vscode.ThemeColor('statusBarItem.errorBackground')
    : pct >= 80 ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = { enabledCommands: ['pokeToken.setQuota', 'pokeToken.open'] };
  md.appendMarkdown(`**PokeToken** — ${pct.toFixed(1)}% del cupo mensual\n\n`);
  md.appendMarkdown(`Hoy: **${fmt(totalOf(today))}** tokens · Mes: **${fmt(totalOf(month))}** tokens\n\n`);
  const rows = (o: Record<string, any>) => Object.entries(o).sort(([, a], [, b]) => totalOf(b) - totalOf(a)).slice(0, 6).map(([k, v]) => `- ${k}: ${fmt(totalOf(v))}`).join('\n');
  md.appendMarkdown(`**Por modelo**\n${rows(byModel) || '- (sin datos)'}\n\n**Por modo**\n${rows(byMode) || '- (sin datos)'}\n\n[Configurar cupo](command:pokeToken.setQuota) · [Abrir panel](command:pokeToken.open)`);
  bar.tooltip = md;
}

function renderPackBar(item: vscode.StatusBarItem, s: GameState): void {
  const n = s.packs + s.premium + s.balls;
  if (!n) { item.hide(); return; }
  item.text = `$(gift) ${n}`;
  item.tooltip = `PokeToken: ${n} ${n === 1 ? 'sobre sin abrir' : 'sobres sin abrir'} (${s.packs} normales · ${s.premium} premium · ${s.balls} Pokébolas). Pulsa para abrir el panel.`;
  item.show();
}

export function deactivate(): void { /* disposables en ctx.subscriptions */ }
