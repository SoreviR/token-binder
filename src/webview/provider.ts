import * as vscode from 'vscode';

export class PokeViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'pokeToken.view';
  private view?: vscode.WebviewView;
  private last?: unknown;

  constructor(private ext: vscode.Uri, private onReady: () => void) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.ext, 'media')] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage(m => { if (m?.type === 'ready') { this.last ? this.post(this.last) : this.onReady(); } });
  }

  post(snapshot: unknown): void {
    this.last = snapshot;
    this.view?.webview.postMessage({ type: 'state', data: snapshot });
  }

  reveal(): void { this.view?.show?.(true); }

  private html(w: vscode.Webview): string {
    const uri = (f: string) => w.asWebviewUri(vscode.Uri.joinPath(this.ext, 'media', f));
    const nonce = Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: ${w.cspSource}; style-src ${w.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${uri('main.css')}"></head>
<body><div id="app"></div><script nonce="${nonce}" src="${uri('main.js')}"></script></body></html>`;
  }
}
