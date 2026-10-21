import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultRoots, runningUserRoot, uniqueRoots } from '../src/usage/paths';

test('defaultRoots: Windows uses %APPDATA%', () => {
  const r = defaultRoots('win32', { APPDATA: 'C:\\Users\\ana\\AppData\\Roaming' }, 'C:\\Users\\ana');
  assert.equal(r[0], 'C:\\Users\\ana\\AppData\\Roaming\\Code\\User');
  assert.equal(r[1], 'C:\\Users\\ana\\AppData\\Roaming\\Code - Insiders\\User');
});

test('defaultRoots: macOS uses Library/Application Support', () => {
  const r = defaultRoots('darwin', {}, '/Users/ana');
  assert.deepEqual(r, ['/Users/ana/Library/Application Support/Code/User', '/Users/ana/Library/Application Support/Code - Insiders/User',
    '/Users/ana/Library/Application Support/VSCodium/User']);
});

test('defaultRoots: Linux uses XDG_CONFIG_HOME or ~/.config', () => {
  assert.equal(defaultRoots('linux', {}, '/home/ana')[0], '/home/ana/.config/Code/User');
  assert.equal(defaultRoots('linux', { XDG_CONFIG_HOME: '/cfg' }, '/home/ana')[0], '/cfg/Code/User');
});

test('runningUserRoot: goes up from globalStorage/<ext> to User', () => {
  assert.equal(runningUserRoot('/data/Code/User/globalStorage/sorevir.token-binder'), '/data/Code/User');
});

test('uniqueRoots: removes duplicates ignoring case outside Linux', () => {
  assert.deepEqual(uniqueRoots(['c:\\x\\Code\\User', 'C:\\x\\Code\\User\\', 'C:\\x\\Other\\User'], 'win32'), ['c:\\x\\Code\\User', 'C:\\x\\Other\\User']);
  assert.deepEqual(uniqueRoots(['/a/User', '/A/User'], 'linux'), ['/a/User', '/A/User']);
});
