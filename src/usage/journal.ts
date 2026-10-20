// Reconstruye una sesión de Copilot Chat a partir del journal .jsonl
// (kind 0 = raíz, 1 = set en ruta, 2 = push/splice en array, 3 = delete).
type Path = (string | number)[];
type Json = any;

function walk(root: Json, path: Path, create: boolean): { parent: Json; key: string | number } | undefined {
  if (!path.length) { return undefined; }
  let cur = root;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (cur[k] === undefined || cur[k] === null) {
      if (!create) { return undefined; }
      cur[k] = typeof path[i + 1] === 'number' ? [] : {};
    }
    cur = cur[k];
  }
  return { parent: cur, key: path[path.length - 1] };
}

export function replayJournal(text: string): Json | undefined {
  let root: Json;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) { continue; }
    let ev: Json;
    try { ev = JSON.parse(line); } catch { continue; } // línea parcial al final del archivo
    if (ev.kind === 0) { root = ev.v; continue; }
    if (root === undefined) { continue; }
    const path: Path = ev.k ?? [];
    if (ev.kind === 1) {
      if (!path.length) { root = ev.v; continue; }
      const t = walk(root, path, true);
      if (t) { t.parent[t.key] = ev.v; }
    } else if (ev.kind === 2) {
      const t = path.length ? walk(root, path, true) : undefined;
      const arr = t ? (t.parent[t.key] ??= []) : root;
      if (typeof ev.i === 'number') { arr.length = Math.min(arr.length, ev.i); }
      if (Array.isArray(ev.v)) { arr.push(...ev.v); }
    } else if (ev.kind === 3) {
      const t = walk(root, path, false);
      if (t) { Array.isArray(t.parent) ? t.parent.splice(Number(t.key), 1) : delete t.parent[t.key]; }
    }
  }
  return root;
}

export function parseSessionFile(name: string, text: string): Json | undefined {
  if (name.endsWith('.jsonl')) { return replayJournal(text); }
  try { return JSON.parse(text); } catch { return undefined; }
}
