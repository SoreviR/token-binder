import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { UsageStore } from '../src/usage/store';
import { replayJournal } from '../src/usage/journal';
import { extractSession } from '../src/usage/extract';
import { parseLimit, periodStart } from '../src/quota';

test('quota: parseLimit understands suffixes and thousands separators', () => {
  assert.equal(parseLimit('5M'), 5_000_000);
  assert.equal(parseLimit('750k'), 750_000);
  assert.equal(parseLimit('1.5M'), 1_500_000);
  assert.equal(parseLimit('1,5m'), 1_500_000);
  assert.equal(parseLimit('5.000.000'), 5_000_000);
  assert.equal(parseLimit('5000000'), 5_000_000);
  assert.equal(parseLimit('0'), undefined);
  assert.equal(parseLimit('abc'), undefined);
  assert.equal(parseLimit(''), undefined);
});

const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic.jsonl'), 'utf8');

test('journal: applies kinds 0/1/2/3 and ignores the trailing partial line', () => {
  const s = replayJournal(text);
  assert.equal(s.sessionId, 'sess-1');
  assert.equal(s.requests.length, 2); // r3 deleted
  assert.equal(s.requests[0].copilotCredits, 0.42);
  assert.equal(s.inputState.mode.id, 'ask');
});

test('extract: modelTotals rules; cached is separated from input', () => {
  const recs = extractSession(replayJournal(text), 'x', 0);
  const r1 = recs.find(r => r.key.startsWith('sess-1:r1'))!;
  assert.deepEqual([r1.input, r1.cached, r1.output, r1.credits, r1.model], [4000, 8000, 900, 0.42, 'gpt-5']);
});

test('extract: without modelTotals it falls back to result.metadata', () => {
  const r2 = extractSession(replayJournal(text), 'x', 0).find(r => r.key === 'sess-1:r2')!;
  assert.deepEqual([r2.input, r2.output], [3000, 200]);
});

test('extract: a request without a response does not count', () => {
  const s = { sessionId: 's', requests: [{ requestId: 'a' }] };
  assert.equal(extractSession(s, 'x', 0).length, 0);
});

test('quota: periodStart respects resetDay', () => {
  const d = Date.UTC(2026, 9, 20); // Oct 20
  assert.equal(periodStart(d, 1), Date.UTC(2026, 9, 1));
  assert.equal(periodStart(d, 25), Date.UTC(2026, 8, 25));
});

test('store: the game total leaves the cache out and never goes down or counts twice', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-usage-'));
  const file = path.join(dir, 'User', 'workspaceStorage', 'ws', 'chatSessions', 's.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const write = (reqs: object[]) => fs.writeFileSync(file, JSON.stringify({ sessionId: 's', requests: reqs }));
  const req = (id: string, inputTokens: number, cachedTokens: number, outputTokens: number) =>
    ({ requestId: id, timestamp: 1, modelTotals: { m: { inputTokens, cachedTokens, outputTokens } } });
  try {
    const store = new UsageStore(() => [path.join(dir, 'User')]);
    write([req('a', 1000, 800, 100), req('b', 500, 0, 50)]);
    store.refresh();
    assert.equal(store.lifetimeTokens(), 200 + 100 + 500 + 50);       // input minus cache, plus output
    assert.equal(store.rawLifetimeTokens(), 1000 + 100 + 500 + 50);

    write([]);                                                       // the file is read empty for a moment
    store.refresh();
    assert.equal(store.lifetimeTokens(), 850);                       // it does not go down...
    write([req('a', 1000, 800, 100), req('b', 500, 0, 50)]);
    store.refresh();
    assert.equal(store.lifetimeTokens(), 850);                       // ...and it does not count twice when it comes back
    write([req('a', 1000, 800, 100), req('b', 500, 0, 50), req('c', 100, 0, 10)]);
    store.refresh();
    assert.equal(store.lifetimeTokens(), 960);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
