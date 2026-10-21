import * as vscode from 'vscode';
import type { WebviewMessage } from './provider';

/** Editor tab with the full album (large grid, search, filters and card viewer). */
export class AlbumPanel {
  private panel?: vscode.WebviewPanel;
  private last?: unknown;

  constructor(
    private ext: vscode.Uri,
    private cacheRoot: vscode.Uri,
    private onReady: () => void,
    private onMessage: (m: WebviewMessage) => void,
  ) {}

  get open(): boolean { return !!this.panel; }

  show(): void {
    if (this.panel) { this.panel.reveal(this.panel.viewColumn ?? vscode.ViewColumn.Active); return; }
    const panel = vscode.window.createWebviewPanel('tokenBinder.album', 'Álbum TokenBinder', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true, // keeps the filter and search when switching tabs
      localResourceRoots: [vscode.Uri.joinPath(this.ext, 'media'), this.cacheRoot],
    });
    this.panel = panel;
    panel.webview.html = this.html(panel.webview);
    panel.onDidDispose(() => { if (this.panel === panel) { this.panel = undefined; this.last = undefined; } });
    panel.webview.onDidReceiveMessage((m: WebviewMessage) => {
      if (m?.type === 'ready') { this.last ? this.post(this.last) : this.onReady(); }
      else if (m?.type) { this.onMessage(m); }
    });
  }

  uri(fsPath: string): string | undefined {
    return this.panel?.webview.asWebviewUri(vscode.Uri.file(fsPath)).toString();
  }

  post(data: unknown): void {
    this.last = data;
    void this.panel?.webview.postMessage({ type: 'album', data });
  }

  send(msg: WebviewMessage): void { void this.panel?.webview.postMessage(msg); }

  private html(w: vscode.Webview): string {
    const uri = (f: string) => w.asWebviewUri(vscode.Uri.joinPath(this.ext, 'media', f));
    const nonce = Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${w.cspSource}; style-src ${w.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${uri('main.css')}"></head>
<body class="album"><div id="app"></div><div id="overlay"></div>
<script nonce="${nonce}" src="${uri('i18n.js')}"></script><script nonce="${nonce}" src="${uri('common.js')}"></script><script nonce="${nonce}" src="${uri('album.js')}"></script></body></html>`;
  }
}
