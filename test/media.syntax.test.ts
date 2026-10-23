// The webview scripts are plain files the extension host never loads, so a typo in one (a stray parenthesis) only shows up as an
// empty panel. Parsing every one of them here makes that a failing test instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';

const dir = path.join(__dirname, '..', 'media');

test('every script of the webviews parses', () => {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  assert.ok(files.includes('album.js') && files.includes('main.js'), 'the album and the side panel scripts are there');
  for (const f of files) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: 'media/' + f }), f + ' has a syntax error');
  }
});
