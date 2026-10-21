import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { CHECK_EVERY_MS, isNewer, parseVersion, pickRelease, shouldCheck, shouldNotify, verifyDownload } from '../src/update/logic';
import { MementoLike, backupIfUpgraded, backupName, backupsToPrune, exportPayload, parseImport } from '../src/game/backup';
import { STATE_SCHEMA, newState } from '../src/game/engine';

const release = (over: Record<string, unknown> = {}, asset: Record<string, unknown> = {}) => ({
  tag_name: 'v1.5.0', draft: false, prerelease: false,
  assets: [{
    name: 'token-binder-1.5.0.vsix', size: 45_000, digest: 'sha256:' + 'a'.repeat(64),
    browser_download_url: 'https://github.com/SoreviR/token-binder/releases/download/v1.5.0/token-binder-1.5.0.vsix', ...asset,
  }],
  ...over,
});

test('parseVersion accepts X.Y.Z with an optional v and rejects everything else', () => {
  assert.deepEqual(parseVersion('v1.10.2'), [1, 10, 2]);
  assert.deepEqual(parseVersion('1.0.0'), [1, 0, 0]);
  for (const bad of ['1.0', '1.0.0-beta', 'v1.0.0.1', 'latest', '', 'v1.x.0']) { assert.equal(parseVersion(bad), undefined, bad); }
});

test('isNewer compares numerically, not as text', () => {
  assert.equal(isNewer('1.10.0', '1.9.0'), true);
  assert.equal(isNewer('1.9.0', '1.10.0'), false);
  assert.equal(isNewer('2.0.0', '1.99.99'), true);
  assert.equal(isNewer('1.5.0', '1.5.0'), false);
  assert.equal(isNewer('v1.5.1', '1.5.0'), true);
  assert.equal(isNewer('garbage', '1.5.0'), false);
  assert.equal(isNewer('1.5.0', 'dev'), false);
});

test('pickRelease accepts a valid release and exposes version, size, hash and notes link', () => {
  const r = pickRelease(release())!;
  assert.equal(r.version, '1.5.0');
  assert.equal(r.size, 45_000);
  assert.equal(r.sha256, 'a'.repeat(64));
  assert.equal(r.notesUrl, 'https://github.com/SoreviR/token-binder/releases/tag/v1.5.0');
  assert.equal(pickRelease(release({}, { digest: null }))!.sha256, undefined);   // releases from before GitHub reported digests
});

test('pickRelease rejects drafts, prereleases, odd tags, wrong asset names and URLs from anywhere else', () => {
  assert.equal(pickRelease(release({ draft: true })), undefined);
  assert.equal(pickRelease(release({ prerelease: true })), undefined);
  assert.equal(pickRelease(release({ tag_name: 'v1.5.0-beta' })), undefined);
  assert.equal(pickRelease(release({ tag_name: '1.5.0' })), undefined);
  assert.equal(pickRelease(release({}, { name: 'poke-token-1.5.0.vsix' })), undefined);
  assert.equal(pickRelease(release({}, { browser_download_url: 'https://evil.example/token-binder-1.5.0.vsix' })), undefined);
  assert.equal(pickRelease(release({}, { browser_download_url: 'https://github.com/other/repo/releases/download/v1.5.0/token-binder-1.5.0.vsix' })), undefined);
  assert.equal(pickRelease(release({}, { size: 0 })), undefined);
  assert.equal(pickRelease(release({}, { size: 500 * 1024 * 1024 })), undefined);
  assert.equal(pickRelease({ assets: [] }), undefined);
  assert.equal(pickRelease(null), undefined);
  assert.equal(pickRelease(release({ assets: undefined })), undefined);
});

test('verifyDownload checks size and, when published, the SHA-256', () => {
  const data = new TextEncoder().encode('vsix bytes');
  const sha256 = createHash('sha256').update(data).digest('hex');
  assert.equal(verifyDownload(data, { size: data.length, sha256 }), true);
  assert.equal(verifyDownload(data, { size: data.length }), true);                       // no digest published: size only
  assert.equal(verifyDownload(data, { size: data.length + 1, sha256 }), false);
  assert.equal(verifyDownload(data, { size: data.length, sha256: 'b'.repeat(64) }), false);
});

test('shouldCheck: automatic checks run once every 24 h and can be turned off; manual always runs', () => {
  const now = 1_000_000_000_000;
  assert.equal(shouldCheck({ now, lastCheck: undefined, manual: false, enabled: true }), true);
  assert.equal(shouldCheck({ now, lastCheck: now - 1000, manual: false, enabled: true }), false);
  assert.equal(shouldCheck({ now, lastCheck: now - CHECK_EVERY_MS, manual: false, enabled: true }), true);
  assert.equal(shouldCheck({ now, lastCheck: undefined, manual: false, enabled: false }), false);
  assert.equal(shouldCheck({ now, lastCheck: now - 1000, manual: true, enabled: false }), true);
  assert.equal(shouldCheck({ now, lastCheck: now + 5 * 3600_000, manual: false, enabled: true }), true);   // clock moved back
});

test('shouldNotify: a skipped version stays quiet, a newer one is announced again, manual always tells', () => {
  assert.equal(shouldNotify('1.5.0', '1.5.0', false), false);
  assert.equal(shouldNotify('1.6.0', '1.5.0', false), true);
  assert.equal(shouldNotify('1.5.0', undefined, false), true);
  assert.equal(shouldNotify('1.5.0', '1.5.0', true), true);
});

/* ───── export format and automatic backups ───── */

test('parseImport: accepts current and pre-schema files, refuses newer schemas and foreign files', () => {
  const game = newState(0);
  assert.equal(parseImport(exportPayload(game, '1.5.0')).ok, true);
  const old = { app: 'token-binder', exportedAt: 'x', game };            // exported before `schema` existed
  assert.equal(parseImport(old).ok, true);
  assert.deepEqual(parseImport({ ...exportPayload(game, '9.0.0'), schema: STATE_SCHEMA + 1 }), { ok: false, reason: 'tooNew' });
  assert.deepEqual(parseImport({ app: 'other', game }), { ok: false, reason: 'format' });
  assert.deepEqual(parseImport({ app: 'token-binder', game: { v: 1 } }), { ok: false, reason: 'format' });
  assert.deepEqual(parseImport({ app: 'token-binder', game: { v: 2, collection: null, slots: [] } }), { ok: false, reason: 'format' });
  assert.deepEqual(parseImport(null), { ok: false, reason: 'format' });
});

test('backupsToPrune keeps the newest three and ignores unrelated files', () => {
  const names = ['progress-1.1.0-20261001T100000Z.json', 'progress-1.2.0-20261002T100000Z.json', 'progress-1.3.0-20261003T100000Z.json',
    'progress-1.4.0-20261004T100000Z.json', 'progress-earlier-20260930T100000Z.json', 'notes.txt'];
  assert.deepEqual(backupsToPrune(names).sort(), ['progress-1.1.0-20261001T100000Z.json', 'progress-earlier-20260930T100000Z.json']);
  assert.deepEqual(backupsToPrune(names.slice(0, 2)), []);
});

class FakeMemento implements MementoLike {
  data: Record<string, unknown> = {};
  get<T>(key: string): T | undefined { return this.data[key] as T | undefined; }
  async update(key: string, value: unknown): Promise<void> { this.data[key] = value; }
}

test('backupIfUpgraded: copies the progress only when the version changed, remembers it and keeps three', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-backup-'));
  try {
    const m = new FakeMemento();
    const game = newState(0);
    game.coins = 123;

    assert.equal(await backupIfUpgraded(m, '1.5.0', dir), undefined);                    // fresh install: nothing to save
    assert.equal(m.data['tokenBinder.lastVersion'], '1.5.0');
    assert.equal(await backupIfUpgraded(m, '1.5.0', dir), undefined);                    // same version again

    m.data['tokenBinder.game.v2'] = game;
    const t0 = Date.UTC(2026, 9, 21, 12, 0, 0);
    for (const [i, v] of ['1.6.0', '1.7.0', '1.8.0', '1.9.0'].entries()) {
      const file = await backupIfUpgraded(m, v, dir, new Date(t0 + i * 1000));
      assert.ok(file && fs.existsSync(file), v);
    }
    const left = fs.readdirSync(dir).sort();
    assert.equal(left.length, 3);
    assert.ok(left[0].startsWith('progress-1.6.0-') && left[2].startsWith('progress-1.8.0-'), left.join());   // the one for 1.5.0 was pruned
    const saved = JSON.parse(fs.readFileSync(path.join(dir, left[2]), 'utf8'));
    assert.equal(saved.game.coins, 123);
    assert.equal(saved.extensionVersion, '1.8.0');
    assert.equal(parseImport(saved).ok, true);                                          // a backup is a valid import file

    // upgrading from a version that predates lastVersion tracking
    const m2 = new FakeMemento();
    m2.data['tokenBinder.game.v2'] = game;
    const first = await backupIfUpgraded(m2, '1.5.0', dir, new Date(t0 + 99_000));
    assert.ok(first && path.basename(first).startsWith('progress-earlier-'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('backupName sorts chronologically as text', () => {
  const a = backupName('1.0.0', new Date(Date.UTC(2026, 0, 2, 3, 4, 5)));
  const b = backupName('1.0.0', new Date(Date.UTC(2026, 10, 2, 3, 4, 5)));
  assert.equal(a, 'progress-1.0.0-20260102T030405Z.json');
  assert.ok(a < b);
});
