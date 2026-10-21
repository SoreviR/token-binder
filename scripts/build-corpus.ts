// Builds test/fixtures/battle-corpus.json: ~300 real cards from TCGdex covering every era, stage and rarity the game can
// hand out. The balance tests and `npm run balance` run offline against this file. Usage: npx tsx scripts/build-corpus.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Tcgdex } from '../src/game/tcgdex';
import { Card, ERAS } from '../src/game/engine';

const PER_ERA = Number(process.argv[2] ?? 64);

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-corpus-'));
  const tcg = new Tcgdex(dir) as any;
  const seen = new Map<string, Card>();
  for (const era of ERAS) {
    let got = 0, tries = 0;
    while (got < PER_ERA && tries < PER_ERA * 6) {
      tries++;
      const card: Card | undefined = await tcg.rollCard(era.id, tries % 4);
      if (card && !seen.has(card.id)) { seen.set(card.id, { ...card, image: '', variant: undefined }); got++; }
    }
    console.log(era.id, got, 'cards');
  }
  const cards = [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'battle-corpus.json'), JSON.stringify(cards));
  console.log('total', cards.length, 'cards');
  fs.rmSync(dir, { recursive: true, force: true });
})();
