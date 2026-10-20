import * as vscode from 'vscode';

export type WebviewMessage = { type: string; [k: string]: unknown };

export class BinderViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'tokenBinder.view';
  private view?: vscode.WebviewView;
  private last?: unknown;

  /** `cacheRoot` es la carpeta (en globalStorage) con las imágenes de cartas que el panel puede cargar. */
  constructor(
    private ext: vscode.Uri,
    private cacheRoot: vscode.Uri,
    private onReady: () => void,
    private onMessage: (m: WebviewMessage) => void,
  ) {}

  get visible(): boolean { return !!this.view; }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.onDidDispose(() => { if (this.view === view) { this.view = undefined; } });
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.ext, 'media'), this.cacheRoot] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((m: WebviewMessage) => {
      if (m?.type === 'ready') { this.last ? this.post(this.last) : this.onReady(); }
      else if (m?.type) { this.onMessage(m); }
    });
  }

  /** Convierte una ruta local de la caché en una URI que el panel puede cargar. */
  uri(fsPath: string): string | undefined {
    return this.view?.webview.asWebviewUri(vscode.Uri.file(fsPath)).toString();
  }

  post(snapshot: unknown): void {
    // Al recargar el panel se reenvía el último estado; sin los avisos (events) para no repetirlos.
    this.last = { ...(snapshot as object), events: [] };
    this.send({ type: 'state', data: snapshot });
  }

  send(msg: WebviewMessage): void { void this.view?.webview.postMessage(msg); }

  private html(w: vscode.Webview): string {
    const uri = (f: string) => w.asWebviewUri(vscode.Uri.joinPath(this.ext, 'media', f));
    const nonce = Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${w.cspSource}; style-src ${w.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${uri('main.css')}"></head>
<body><div id="app"></div><div id="overlay"></div>
<script nonce="${nonce}" src="${uri('common.js')}"></script><script nonce="${nonce}" src="${uri('main.js')}"></script></body></html>`;
  }
}
