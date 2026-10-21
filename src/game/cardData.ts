// Turns a TCGdex card response into a Card. Pure (no file access), so the extension and the server read cards the same way.
import { CARD_DATA_VERSION, Card, tierOf } from './engine';
import { parseDamage, parsePricing } from './stats';

/** Turns a TCGdex response into a card (undefined if it is not a Pokémon card with an image). */
export function parseCard(c: any): Card | undefined {
  if (!c || c.category !== 'Pokemon' || !c.image || !c.name) { return undefined; }
  const holo = !!c.variants?.holo;
  let tier = tierOf(c.rarity);
  if (holo && tier < 3) { tier = 3; } // in vintage a holo is listed as "Rare"
  const types = (list: any): string[] | undefined => (Array.isArray(list) && list.length ? list.map((x: any) => String(x.type)) : undefined);
  return {
    id: c.id, name: c.name, rarity: c.rarity ?? 'Common', tier, stage: c.stage, evolveFrom: c.evolveFrom,
    dexId: Array.isArray(c.dexId) ? c.dexId[0] : undefined, hp: typeof c.hp === 'number' ? c.hp : undefined,
    types: c.types, set: c.set?.name, setId: c.set?.id, holo,
    shadowless: Array.isArray(c.variants_detailed) && c.variants_detailed.some((v: { subtype?: string }) => v.subtype === 'shadowless'),
    attacks: Array.isArray(c.attacks) ? c.attacks.map((a: any) => ({ name: String(a.name), damage: parseDamage(a.damage), cost: Array.isArray(a.cost) ? a.cost.length : 0 })) : [],
    weak: types(c.weaknesses), resist: types(c.resistances), retreat: typeof c.retreat === 'number' ? c.retreat : undefined,
    price: parsePricing(c.pricing), priceAt: Date.now(), cv: CARD_DATA_VERSION,
    image: c.image,
  };
}
