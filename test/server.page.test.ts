// The public ranking page is static files: these checks keep it safe (no injection, strict CSP) and complete (both languages, no dead links).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

const pub = path.join(__dirname, '..', 'server', 'public');
const read = (f: string) => fs.readFileSync(path.join(pub, f), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'vercel.json'), 'utf8'));

test('the page builds the DOM without innerHTML, eval or inline handlers', () => {
  const js = read('league.js'), html = read('league.html');
  for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', "setAttribute('style'"]) { assert.ok(!js.includes(bad), `league.js uses ${bad}`); }
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'no inline script');
  assert.ok(!/\son\w+\s*=/i.test(html), 'no inline event handlers');
  assert.ok(!/<style[\s>]/i.test(html), 'no inline style block');
});

test('the page only references files that exist, with absolute paths (it is served under /l/<code>)', () => {
  const html = read('league.html');
  for (const m of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) { assert.ok(fs.existsSync(path.join(pub, m[1].slice(1))), `missing ${m[1]}`); }
  assert.ok(!/(?:href|src)="(?!\/|data:|#|https:)/.test(html), 'a relative link would break under /l/<code>');
});

test('the Content-Security-Policy of the page blocks inline scripts and foreign hosts', () => {
  for (const source of ['/l/:code', '/league.html']) {
    const rule = config.headers.find((h: { source: string }) => h.source === source);
    assert.ok(rule, `no headers for ${source}`);
    const csp: string = rule.headers.find((h: { key: string }) => h.key === 'Content-Security-Policy').value;
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
    assert.match(csp, /img-src https:\/\/assets\.tcgdex\.net data:/);
    assert.match(csp, /connect-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
  }
  assert.ok(config.rewrites.some((r: { source: string; destination: string }) => r.source === '/l/:code' && r.destination === '/league.html'));
});

test('both languages have the same texts and the same placeholders', () => {
  const src = read('league.js');
  const start = src.indexOf('const TEXTS = '), end = src.indexOf('const lang =');
  const sandbox: { out?: { en: Record<string, string>; es: Record<string, string> } } = {};
  vm.runInNewContext(src.slice(start, end).replace('const TEXTS = ', 'out = ').replace(/;\s*$/, ''), sandbox);
  const { en, es } = sandbox.out!;
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  const slots = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();
  for (const k of Object.keys(en)) { assert.equal(slots(es[k]), slots(en[k]), `placeholders of "${k}" differ`); }
  // every t('key') used in the page exists
  for (const m of src.matchAll(/\bt\('([a-zA-Z]+)'/g)) { assert.ok(m[1] in en, `league.js uses unknown text "${m[1]}"`); }
  for (const m of src.matchAll(/\[\s*'(?:elo|wins|rate)',\s*'(\w+)'\s*\]/g)) { assert.ok(m[1] in en, `sort label "${m[1]}" missing`); }
});
