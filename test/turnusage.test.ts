import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTurnUsage } from '../src/usage/extract';

// Real shapes of session.db › turn_usage (VS Code 1.142), reduced to the numeric fields.
const rows = [
  { turnId: 't1', usage: { inputTokens: 14502, outputTokens: 16, model: 'gpt-6-luna', cacheReadTokens: 0,
    _meta: { copilotUsage: { totalNanoAiu: 182067500 }, turnTokenTotals: [{ model: 'gpt-6-luna', inputTokens: 14502, cachedTokens: 0, outputTokens: 16 }] } } },
  // Agent with several rounds: the top level is just the last call; turnTokenTotals rules.
  { turnId: 't3', usage: { inputTokens: 38228, outputTokens: 2917, model: 'gpt-6-luna', cacheReadTokens: 37604,
    _meta: { copilotUsage: { totalNanoAiu: 1143081500 }, turnTokenTotals: [{ model: 'gpt-6-luna', inputTokens: 299951, cachedTokens: 261699, outputTokens: 8066 }] } } },
];

test('turn_usage: uses turnTokenTotals and separates cached tokens from input', () => {
  const [a, b] = extractTurnUsage('sess', rows);
  assert.deepEqual([a.input, a.cached, a.output, a.model], [14502, 0, 16, 'gpt-6-luna']);
  assert.deepEqual([b.input, b.cached, b.output], [299951 - 261699, 261699, 8066]);
  assert.equal(b.credits, 1.1430815);
  assert.equal(a.ts, 0); // the store sets the date
});

test('turn_usage: without turnTokenTotals it falls back to the top-level fields', () => {
  const [r] = extractTurnUsage('s', [{ turnId: 'x', usage: { inputTokens: 100, outputTokens: 5, cacheReadTokens: 40, model: 'm' } }]);
  assert.deepEqual([r.input, r.cached, r.output], [60, 40, 5]);
});
