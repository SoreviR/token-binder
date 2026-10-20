import * as vscode from 'vscode';
import * as path from 'path';
import { UsageStore, totalOf } from './usage/store';
import { defaultRoots } from './usage/paths';
import { fmt, parseLimit, percent, periodStart, used, Unit } from './quota';
import { GameStore } from './game/state';
import { advance, progressOf, LINES, GameState } from './game/engine';
import { getSprite } from './game/sprites';
import { PokeViewProvider } from './webview/provider';
import { lastBackend } from './usage/sqlite';

const cfg = () => vscode.workspace.getConfiguration('pokeToken');

export function activate(ctx: vscode.ExtensionContext): void {
  const roots = () => { const r = cfg().get<string[]>('storageRoots', []); return r.length ? r : defaultRoots(); };
  const usage = new UsageStore(roots);
  usage.stamps = ctx.globalState.get('pokeToken.stamps.v1', usage.stamps);
  const log = vscode.window.createOutputChannel('PokeToken');
  const game = new GameStore(ctx.globalState);
  const spriteDir = path.join(ctx.globalStorageUri.fsPath, 'sprites');

  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  bar.command = 'pokeToken.open';
  bar.show();

  const provider = new PokeViewProvider(ctx.extensionUri, () => void tick(true));
  let state: GameState | undefined;
  let busy = false;
  let lastLogged = '';

  async function tick(force = false): Promise<void> {
    if (busy) { return; }
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
      const res = advance(state, lifetime, mult, start, pct);
      state = res.state;
      await game.save(state);

      await alerts(start, pct);
      renderBar(bar, unit, usedNow, pct, agg.today, agg.month, agg.byModel, agg.byMode);
      provider.post(await snapshot(unit, limit, usedNow, pct, agg, state, lifetime, mult, res.events));
    } finally { busy = false; }
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

  async function snapshot(unit: Unit, limit: number, usedNow: number, pct: number, agg: ReturnType<UsageStore['aggregate']>, s: GameState, lifetime: number, mult: number, events: string[]) {
    const pr = progressOf(s.current, lifetime, mult);
    const line = LINES[s.current.lineIdx];
    const sprite = pr.species ? await getSprite(spriteDir, pr.species.id, s.current.shiny) : undefined;
    const dexIds = [...new Map(s.dex.slice(-48).reverse().map(d => [`${d.id}${d.shiny}`, d])).values()];
    const dex = await Promise.all(dexIds.map(async d => ({ ...d, sprite: await getSprite(spriteDir, d.id, d.shiny) })));
    const b = (x: { input: number; cached: number; output: number; credits: number }) => ({ ...x, total: totalOf(x) });
    return {
      unit, limit, used: usedNow, pct, events,
      today: b(agg.today), month: b(agg.month),
      byModel: Object.entries(agg.byModel).map(([k, v]) => ({ name: k, ...b(v) })).sort((a, c) => c.total - a.total),
      byMode: Object.entries(agg.byMode).map(([k, v]) => ({ name: k, ...b(v) })).sort((a, c) => c.total - a.total),
      daily: agg.daily,
      pokemon: {
        egg: pr.stage === 0, name: pr.species?.name ?? 'Huevo', line: line.map(l => l.name), stage: pr.stage,
        shiny: s.current.shiny, nature: s.current.nature, pct: pr.pct, into: pr.into, span: pr.span, sprite,
      },
      dex, dexCount: s.dex.length,
    };
  }

  ctx.subscriptions.push(
    bar, log,
    vscode.window.registerWebviewViewProvider(PokeViewProvider.viewType, provider),
    vscode.commands.registerCommand('pokeToken.open', () => vscode.commands.executeCommand('workbench.view.extension.pokeToken')),
    vscode.commands.registerCommand('pokeToken.refresh', () => tick(true)),
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

export function deactivate(): void { /* disposables en ctx.subscriptions */ }
