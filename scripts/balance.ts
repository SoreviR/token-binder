// Balance report for the 1v1 battles, run against the real-card corpus (test/fixtures/battle-corpus.json).
// Usage: npm run balance. It is how the constants in strength.ts / battle.ts are tuned; test/balance.test.ts fixes the ranges.
import * as fs from 'fs';
import * as path from 'path';
import { Card } from '../src/game/engine';
import { Fighter, makeFighter, simulate, estimateWin } from '../src/game/battle';
import { LEVEL_STEP, stageClass } from '../src/game/strength';

export const corpus: Card[] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'battle-corpus.json'), 'utf8'));
const XP = (level: number) => (level - 1) * 400_000;

export const fighterOf = (c: Card, level = 10, flat = true, extra: Parameters<typeof makeFighter>[3] = {}) =>
  makeFighter(c.id, c, XP(level), { flat, ...extra });

/** Same fighter with its strength multiplied by `r` (HP and ATK by √r), to draw the strength → win-rate curve. */
export const scaled = (f: Fighter, r: number): Fighter => ({ ...f, hp: Math.round(f.hp * Math.sqrt(r)), atk: f.atk * Math.sqrt(r) });

const pct = (x: number) => (x * 100).toFixed(1).padStart(5) + '%';

function winRate(a: Fighter, b: Fighter, runs: number, seed: number): number {
  let w = 0;
  for (let i = 0; i < runs; i++) { if (simulate(a, b, seed + i * 104729).winner === 'a') { w++; } }
  return w / runs;
}

if (require.main === module) {
  const cards = corpus;
  const flat = cards.map(c => fighterOf(c));

  console.log(`== Corpus: ${cards.length} cards, level 10, strength factors flattened (only the printed data differs) ==`);
  // Every card against 40 others
  const per = flat.map((f, i) => {
    let sum = 0, n = 0;
    for (let k = 1; k <= 40; k++) { const j = (i + k * 7) % flat.length; if (j === i) { continue; } sum += winRate(f, flat[j], 24, 11 + i * 1_000_003 + j * 7919); n++; }
    return { card: cards[i], rate: sum / n };
  }).sort((a, b) => a.rate - b.rate);
  const rates = per.map(p => p.rate);
  console.log('per-card win rate vs the field: min', pct(rates[0]), ' p10', pct(rates[Math.floor(rates.length * .1)]), ' median', pct(rates[Math.floor(rates.length / 2)]),
    ' p90', pct(rates[Math.floor(rates.length * .9)]), ' max', pct(rates[rates.length - 1]));
  console.log('weakest:', per.slice(0, 5).map(p => `${p.card.name} (${p.card.era}/${stageClass(p.card)}) ${pct(p.rate)}`).join(' | '));
  console.log('strongest:', per.slice(-5).map(p => `${p.card.name} (${p.card.era}/${stageClass(p.card)}) ${pct(p.rate)}`).join(' | '));

  // Worst pairs
  let worst = { a: '', b: '', rate: 0.5 };
  for (let i = 0; i < flat.length; i += 3) {
    for (let j = 0; j < flat.length; j += 5) {
      if (i === j) { continue; }
      const r = winRate(flat[i], flat[j], 200, 5 + i * 1_000_003 + j * 7919);
      if (Math.abs(r - 0.5) > Math.abs(worst.rate - 0.5)) { worst = { a: cards[i].name, b: cards[j].name, rate: r }; }
    }
  }
  console.log('most lopsided sampled pair:', worst.a, 'vs', worst.b, pct(worst.rate));

  // By era / stage class
  const groups = new Map<string, number[]>();
  per.forEach(p => { const k = `${p.card.era}/${stageClass(p.card)}`; groups.set(k, [...(groups.get(k) ?? []), p.rate]); });
  console.log('\nby era/stage (mean win rate):');
  for (const [k, v] of [...groups].sort()) { console.log('  ', k.padEnd(18), pct(v.reduce((s, x) => s + x, 0) / v.length), `(n=${v.length})`); }

  const sample = flat[0];
  console.log('\n== Mirror (same card vs itself) ==', pct(winRate(sample, sample, 4000, 99)));

  console.log('\n== Strength ratio → win rate of the stronger side ==');
  for (const r of [1.05, 1.1, 1.25, 1.5, 2]) { console.log('  ratio', r.toFixed(2), pct(winRate(scaled(sample, r), sample, 3000, 5))); }

  console.log('\n== Level advantage (same card) ==');
  for (const d of [1, 5, 10, 20, 40]) { console.log('  +' + d, 'levels', pct(winRate(fighterOf(cards[0], 1 + d), fighterOf(cards[0], 1), 3000, 5)), `(strength x${((1 + LEVEL_STEP * d) ).toFixed(2)})`); }

  const withWeak = cards.filter(c => (c.weak ?? []).length);
  let tw = 0, tn = 0;
  for (const defender of withWeak.slice(0, 40)) {
    const attacker = cards.find(c => c.types?.[0] === defender.weak![0] && c.id !== defender.id);
    if (!attacker) { continue; }
    tw += winRate(fighterOf(attacker), fighterOf(defender), 400, 3); tn++;
  }
  console.log('\n== Type advantage (attacker hits the defender\'s weakness), mean win rate ==', pct(tw / Math.max(1, tn)), `(n=${tn})`);

  let rounds = 0, runs = 0, timeouts = 0;
  for (let i = 0; i < flat.length; i += 2) { const j = (i * 5 + 3) % flat.length; for (let s = 0; s < 6; s++) { const r = simulate(flat[i], flat[j], s * 31 + i); rounds += r.rounds; runs++; if (r.reason === 'timeout') { timeouts++; } } }
  console.log('\n== Duration == mean rounds', (rounds / runs).toFixed(2), ' timeouts', timeouts, 'of', runs);
  console.log('estimateWin sanity:', pct(estimateWin(scaled(sample, 1.25), sample)));
}
