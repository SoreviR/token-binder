import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { t } from '../i18n';
import { API_LATEST, ReleaseInfo, isNewer, pickRelease, shouldCheck, shouldNotify, verifyDownload } from './logic';

const LAST_CHECK_KEY = 'tokenBinder.update.lastCheck';
const SKIPPED_KEY = 'tokenBinder.update.skipped';
const FIRST_CHECK_DELAY_MS = 30_000;

/**
 * Tells the user when a newer release exists on GitHub and, if they agree, installs it. VS Code does not update
 * extensions installed from a .vsix by itself. Nothing is ever installed without a click.
 */
export class Updater {
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(private ctx: vscode.ExtensionContext, private log: (s: string) => void) {}

  private get current(): string { return String(this.ctx.extension.packageJSON.version); }
  private get enabled(): boolean { return vscode.workspace.getConfiguration('tokenBinder').get<boolean>('updates.check', true); }

  /** Installed from the Marketplace: VS Code already updates it, so we stay out of the way (undocumented field, best effort). */
  private get fromGallery(): boolean { return (this.ctx.extension.packageJSON as { __metadata?: { source?: string } }).__metadata?.source === 'gallery'; }

  /** Schedules the first automatic check a little after startup. */
  start(): void {
    this.timer = setTimeout(() => void this.check(false), FIRST_CHECK_DELAY_MS);
    this.ctx.subscriptions.push({ dispose: () => clearTimeout(this.timer) });
  }

  async check(manual: boolean): Promise<void> {
    if (this.busy || (!manual && this.fromGallery)) { return; }
    const now = Date.now();
    if (!shouldCheck({ now, lastCheck: this.ctx.globalState.get<number>(LAST_CHECK_KEY), manual, enabled: this.enabled })) { return; }
    this.busy = true;
    try {
      const info = await this.fetchLatest();
      await this.ctx.globalState.update(LAST_CHECK_KEY, now);   // only after GitHub answered: being offline today must not cost a whole day
      if (!info) { throw new Error('no usable release'); }
      if (!isNewer(info.version, this.current)) {
        if (manual) { void vscode.window.showInformationMessage(t('update.upToDate', this.current)); }
        return;
      }
      if (!shouldNotify(info.version, this.ctx.globalState.get<string>(SKIPPED_KEY), manual)) { return; }
      await this.offer(info);
    } catch (e) {
      this.log(`[update] check failed: ${e}`);
      if (manual) { void vscode.window.showWarningMessage(t('update.checkFailed')); }
    } finally { this.busy = false; }
  }

  private async fetchLatest(): Promise<ReleaseInfo | undefined> {
    const res = await fetch(API_LATEST, {
      headers: { 'User-Agent': 'tokenbinder-update-check', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) { throw new Error(`GitHub answered ${res.status}`); }
    return pickRelease(await res.json());
  }

  private async offer(info: ReleaseInfo): Promise<void> {
    const now = t('update.now'), notes = t('update.notes'), skip = t('update.skip');
    const pick = await vscode.window.showInformationMessage(t('update.available', info.version, this.current), now, notes, skip);
    if (pick === notes) {
      await vscode.env.openExternal(vscode.Uri.parse(info.notesUrl));
      return this.offer(info);   // after reading the notes, ask again
    }
    if (pick === skip) { await this.ctx.globalState.update(SKIPPED_KEY, info.version); return; }
    if (pick === now) { await this.install(info); }
  }

  private async install(info: ReleaseInfo): Promise<void> {
    const dir = path.join(this.ctx.globalStorageUri.fsPath, 'updates');
    const file = path.join(dir, `token-binder-${info.version}.vsix`);
    try {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: t('update.downloading', info.version) }, async () => {
        const res = await fetch(info.vsixUrl, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) { throw new Error(`download answered ${res.status}`); }
        const data = new Uint8Array(await res.arrayBuffer());
        if (!verifyDownload(data, info)) { throw new Error('the downloaded file does not match the size/SHA-256 published by GitHub'); }
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, data);
        await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(file));
      });
    } catch (e) {
      this.log(`[update] install failed: ${e}`);
      void vscode.window.showErrorMessage(t('update.failed', e instanceof Error ? e.message : String(e)));
      return;
    } finally { try { fs.unlinkSync(file); } catch { /* not created or already gone */ } }
    const reload = t('update.reload');
    const pick = await vscode.window.showInformationMessage(t('update.installed', info.version), reload);
    if (pick === reload) { await vscode.commands.executeCommand('workbench.action.reloadWindow'); }
  }
}
