// Cards for the duels, as TCGdex describes them. Kept in the database so both duelists always fight with the same data and prices.
import { ERAS, Card, Era, eraOfSerie } from '../../src/game/engine';
import { parseCard } from '../../src/game/cardData';
import type { Db } from './db';
import type { FetchJson } from './auth';

const BASE = 'https://api.tcgdex.net/v2/en';
const TTL = 7 * 864e5;   // prices change: the card is read again after a week

/** The card's id inside TCGdex (the album key may end in "#shadowless" / "#first"). */
export const cardIdOf = (key: string): string => key.split('#')[0];

/** Which era each set belongs to (needed for the card's base stats); fetched once and kept in the database. */
async function eraOfSets(db: Db, fetchJson: FetchJson): Promise<Record<string, Era> | undefined> {
  const hit = await db.query<{ v: Record<string, Era> }>('select v from meta where k = $1', ['eras']);
  if (hit[0]) { return hit[0].v; }
  const series = ERAS.flatMap(e => e.series);
  const res = await Promise.all(series.map(s => fetchJson(`${BASE}/series/${s}`)));
  if (res.some(r => !r || !Array.isArray(r.sets))) { return undefined; }
  const map: Record<string, Era> = {};
  series.forEach((s, i) => { const era = eraOfSerie(s); if (era) { for (const x of res[i].sets) { map[x.id] = era; } } });
  await db.query('insert into meta (k, v) values ($1, $2) on conflict (k) do update set v = excluded.v', ['eras', JSON.stringify(map)]);
  return map;
}

/** The card for an album key, from the database or TCGdex. undefined if it does not exist or TCGdex cannot be reached. */
export async function getCard(db: Db, key: string, fetchJson: FetchJson, now: number): Promise<Card | undefined> {
  const id = cardIdOf(key);
  const rows = await db.query<{ data: Card; fetched_at: string }>('select data, fetched_at from cards where id = $1', [id]);
  const cached = rows[0];
  if (cached && now - new Date(cached.fetched_at).getTime() < TTL) { return withVariant(cached.data, key); }
  const card = parseCard(await fetchJson(`${BASE}/cards/${encodeURIComponent(id)}`));
  if (!card) { return cached ? withVariant(cached.data, key) : undefined; }
  const eras = await eraOfSets(db, fetchJson);
  if (card.setId && eras) { card.era = eras[card.setId]; }
  await db.query(
    'insert into cards (id, data, fetched_at) values ($1, $2, now()) on conflict (id) do update set data = excluded.data, fetched_at = excluded.fetched_at',
    [id, JSON.stringify(card)]);
  return withVariant(card, key);
}

function withVariant(card: Card, key: string): Card {
  const v = key.split('#')[1];
  return v === 'shadowless' || v === 'first' ? { ...card, variant: v } : card;
}
