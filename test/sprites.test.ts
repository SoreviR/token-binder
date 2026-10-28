import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Sprites } from '../src/game/sprites';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sprites-'));
const reply = (ok: boolean) => ({ ok, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }) as unknown as Response;

test('downloads the animated front and back sprites and keeps them on disk', async () => {
  const urls: string[] = [];
  const s = new Sprites(tmp(), (async (u: string) => { urls.push(u); return reply(true); }) as unknown as typeof fetch);
  const front = await s.get(25, 'front');
  const back = await s.get(25, 'back');
  assert.ok(front && front.endsWith('front-25.gif') && fs.existsSync(front));
  assert.ok(back && back.endsWith('back-25.gif'));
  assert.ok(urls[0].endsWith('/other/showdown/25.gif'));
  assert.ok(urls[1].endsWith('/other/showdown/back/25.gif'));
  assert.equal(s.cached(25, 'front'), front);
  await s.get(25, 'front');
  assert.equal(urls.length, 2, 'the second request comes from disk');
});

test('falls back to the still PNG when the GIF does not exist', async () => {
  const s = new Sprites(tmp(), (async (u: string) => reply(!u.endsWith('.gif'))) as unknown as typeof fetch);
  const file = await s.get(906, 'back');
  assert.ok(file && file.endsWith('back-906.png'));
});

test('rejects anything that is not a real Pokédex number', async () => {
  let calls = 0;
  const s = new Sprites(tmp(), (async () => { calls++; return reply(true); }) as unknown as typeof fetch);
  for (const bad of [0, -1, 1026, 99999, 1.5, NaN, '25' as unknown as number]) { assert.equal(await s.get(bad, 'front'), undefined); }
  assert.equal(calls, 0);
});

test('offline gives undefined and is not retried', async () => {
  let calls = 0;
  const s = new Sprites(tmp(), (async () => { calls++; throw new Error('offline'); }) as unknown as typeof fetch);
  assert.equal(await s.get(7, 'front'), undefined);
  const n = calls;
  assert.equal(await s.get(7, 'front'), undefined);
  assert.equal(calls, n);
});
