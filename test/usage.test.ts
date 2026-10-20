import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { replayJournal } from '../src/usage/journal';
import { extractSession } from '../src/usage/extract';
import { periodStart } from '../src/quota';

const text = fs.readFileSync(path.join(__dirname, 'fixtures', 'synthetic.jsonl'), 'utf8');

test('journal: aplica kinds 0/1/2/3 e ignora la línea parcial final', () => {
  const s = replayJournal(text);
  assert.equal(s.sessionId, 'sess-1');
  assert.equal(s.requests.length, 2); // r3 borrado
  assert.equal(s.requests[0].copilotCredits, 0.42);
  assert.equal(s.inputState.mode.id, 'ask');
});

test('extract: modelTotals manda; cached se separa del input', () => {
  const recs = extractSession(replayJournal(text), 'x', 0);
  const r1 = recs.find(r => r.key.startsWith('sess-1:r1'))!;
  assert.deepEqual([r1.input, r1.cached, r1.output, r1.credits, r1.model], [4000, 8000, 900, 0.42, 'gpt-5']);
});

test('extract: sin modelTotals cae a result.metadata', () => {
  const r2 = extractSession(replayJournal(text), 'x', 0).find(r => r.key === 'sess-1:r2')!;
  assert.deepEqual([r2.input, r2.output], [3000, 200]);
});

test('extract: request sin respuesta no cuenta', () => {
  const s = { sessionId: 's', requests: [{ requestId: 'a' }] };
  assert.equal(extractSession(s, 'x', 0).length, 0);
});

test('quota: periodStart respeta resetDay', () => {
  const d = Date.UTC(2026, 9, 20); // 20-oct
  assert.equal(periodStart(d, 1), Date.UTC(2026, 9, 1));
  assert.equal(periodStart(d, 25), Date.UTC(2026, 8, 25));
});
