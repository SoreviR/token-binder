import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { lang, resolveLang, setLang, t } from '../src/i18n';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import { ERAS } from '../src/game/engine';
import { ITEM_IDS } from '../src/game/items';

const root = path.join(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

/** media/i18n.js defines window.I18N; it is evaluated here the same way the webview does. */
function webviewDicts(): { en: Record<string, string>; es: Record<string, string> } {
  const sandbox: { window: { I18N?: any } } = { window: {} };
  vm.runInNewContext(read('media/i18n.js'), sandbox);
  return sandbox.window.I18N;
}

test('host dictionaries: es and en have exactly the same keys', () => {
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
});

test('t(): fills placeholders, falls back to English and to the key itself', () => {
  setLang('en');
  assert.equal(t('sell.confirm', 3), 'Sell 3 duplicate cards? You keep one copy of each.');
  assert.equal(t('shop.slot.desc', 2, 6), '2/6 · one more card growing');
  setLang('es');
  assert.equal(lang(), 'es');
  assert.equal(t('sell.button'), 'Vender');
  assert.equal((t as any)('does.not.exist'), 'does.not.exist');
  assert.equal(t('sell.confirm'), '¿Vender {0} cartas repetidas? Te quedas con una copia de cada una.');   // a missing argument keeps the placeholder
  setLang('en');
});

test('resolveLang: explicit setting wins; auto follows the VS Code language', () => {
  assert.equal(resolveLang('en', 'es-ES'), 'en');
  assert.equal(resolveLang('es', 'en'), 'es');
  assert.equal(resolveLang('auto', 'es'), 'es');
  assert.equal(resolveLang('auto', 'es-MX'), 'es');
  assert.equal(resolveLang('auto', 'fr'), 'en');
  assert.equal(resolveLang(undefined, 'de'), 'en');
});

test('webview dictionaries: es and en have exactly the same keys', () => {
  const d = webviewDicts();
  assert.deepEqual(Object.keys(d.es).sort(), Object.keys(d.en).sort());
  for (const [k, v] of Object.entries(d.en)) {
    // the same placeholders must appear in both languages
    const slots = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join();
    assert.equal(slots(d.es[k]), slots(v), `placeholders of "${k}" differ`);
  }
});

test('webview: every static PT.t / t key used in media/*.js exists, and so do the dynamic id families (including every item)', () => {
  const d = webviewDicts();
  for (const f of ['main.js', 'album.js', 'common.js', 'league.js']) {
    for (const m of read('media/' + f).matchAll(/\bt\('([a-zA-Z0-9.]+)'\s*[,)]/g)) {
      assert.ok(m[1] in d.en, `${f} uses unknown key "${m[1]}"`);
    }
  }
  const dynamic = [
    ...[0, 1, 2, 3, 4, 5, 6].map(i => 'tier.' + i),
    ...ERAS.map(e => 'era.' + e.id),
    ...['shadowless', 'first'].flatMap(v => ['variant.' + v, 'variant.tag.' + v]),
    ...['common', 'popular', 'valuable', 'sought', 'chase', 'grail'].map(c => 'collector.' + c),
    ...['tier', 'recent', 'name', 'count', 'level', 'condition'].map(s => 'sort.' + s),
    ...['graded', 'mint', 'worn', 'soaked', 'protected'].map(f => 'filter.' + f),
    ...['evolve', 'train', 'transform', 'protect', 'held', 'repair'].flatMap(k => ['items.group.' + k, 'items.hint.' + k]),
    ...[1, 2, 3, 4].map(w => 'condition.short.' + w),
    ...['centering', 'corners', 'edges', 'surface'].map(n => 'slab.' + n),
    ...['generic', 'github-cancelled', 'github-rejected', 'offline', 'no-server', 'not-configured', 'server-error', 'update-required', 'unauthorized', 'not-connected', 'unknown-player', 'invalid-name', 'too-many-owned', 'too-many-joined', 'invalid-code', 'unknown-code', 'league-full', 'not-member', 'rival-not-member', 'invalid-rival', 'no-fighter', 'rival-no-fighter', 'daily-limit', 'rival-limit', 'card-unavailable', 'try-again', 'invalid-card', 'invalid-xp', 'invalid-grade', 'invalid-item', 'invalid-quota'].map(c => 'league.err.' + c),
    ...ITEM_IDS.flatMap(id => ['item.' + id + '.name', 'item.' + id + '.desc']),
    ...['mega', 'vmax', 'vstar', 'tera'].map(k => 'transform.kind.' + k),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(g => 'grade.' + g),
    ...['level', 'demand', 'rarity', 'stage', 'grade', 'tokens', 'total'].map(f => 'factor.' + f),
    ...[0, 1, 2, 3, 4].map(w => 'condition.' + w),
  ];
  for (const k of dynamic) { assert.ok(k in d.en, `missing "${k}"`); }
});

test('host and webview use the same texts for the shared game labels', () => {
  const d = webviewDicts();
  for (const k of Object.keys(en).filter(k => /^(tier|era|variant|collector)\./.test(k))) {
    assert.equal((en as Record<string, string>)[k], d.en[k], k);
    assert.equal((es as Record<string, string>)[k], d.es[k], k);
  }
});

test('package.nls: both files have the same keys and cover every %key% in package.json', () => {
  const nls = JSON.parse(read('package.nls.json'));
  const nlsEs = JSON.parse(read('package.nls.es.json'));
  assert.deepEqual(Object.keys(nlsEs).sort(), Object.keys(nls).sort());
  for (const m of read('package.json').matchAll(/"%([^%"]+)%"/g)) {
    assert.ok(m[1] in nls, `package.json uses undefined %${m[1]}%`);
  }
});

test('package.json: the language setting exists with auto/en/es', () => {
  const props = JSON.parse(read('package.json')).contributes.configuration.properties;
  assert.deepEqual(props['tokenBinder.language'].enum, ['auto', 'en', 'es']);
  assert.equal(props['tokenBinder.language'].default, 'auto');
});

test('the album items tab lists every item exactly once', () => {
  const src = read('media/album.js');
  const block = src.slice(src.indexOf('const ITEM_GROUPS'), src.indexOf('];', src.indexOf('const ITEM_GROUPS')));
  const held = ['sturdy-plate', 'choice-band', 'quick-claw', 'lucky-charm'];
  const listed = [...block.matchAll(/'([a-z-]+)'/g)].map(m => m[1]).filter(id => (ITEM_IDS as string[]).includes(id));
  assert.deepEqual([...listed, ...held].sort(), [...ITEM_IDS].sort());
});
