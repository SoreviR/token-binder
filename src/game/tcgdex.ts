import * as fs from 'fs';
import * as path from 'path';
import { CARD_DATA_VERSION, Card, ERAS, Era, FindNext, PackKind, eraOfSerie, isPremium, rollEras, rollVariant, shuffledRarities, tierOf } from './engine';
import { parseDamage, parsePricing } from './stats';

const BASE = 'https://api.tcgdex.net/v2/en';
const TIMEOUT = 12_000;
const PRICE_TTL = 7 * 864e5;  // el precio se vuelve a consultar al ver una carta si tiene más de 7 días
const MAX_ATTEMPTS = 14; // intentos (set, rareza) por carta antes de bajar a otra era

interface ListItem { id: string; name: string; image?: string }

/** Cliente mínimo de TCGdex (https://tcgdex.dev, sin clave). Todo lo descargado queda en disco. */
export class Tcgdex {
  private lists = new Map<string, ListItem[]>();
  private eraSets?: Map<Era, string[]>;       // era → ids de sets
  private setEra = new Map<string, Era>();    // id de set → era

  constructor(private dir: string, private rng: () => number = Math.random) {
    fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'cards'), { recursive: true });
  }

  private pick<T>(a: T[]): T { return a[Math.floor(this.rng() * a.length)]; }
  private safe(id: string): string { return id.replace(/[^\w.-]/g, '_'); }

  private async getJson(url: string): Promise<any | undefined> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
      if (!res.ok) { return undefined; }
      return await res.json();
    } catch { return undefined; }
  }

  /** Qué sets pertenecen a cada era (se baja una vez y se guarda en disco). undefined si no hay red ni caché. */
  private async loadEras(): Promise<Map<Era, string[]> | undefined> {
    if (this.eraSets) { return this.eraSets; }
    const file = path.join(this.dir, 'eras.json');
    let data: Record<string, string[]> | undefined;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* sin caché */ }
    if (!data) {
      data = {};
      const series = ERAS.flatMap(e => e.series);
      const res = await Promise.all(series.map(s => this.getJson(`${BASE}/series/${s}`)));
      if (res.some(r => !r || !Array.isArray(r.sets))) { return undefined; }
      series.forEach((s, i) => { data![s] = res[i].sets.map((x: { id: string }) => x.id); });
      fs.writeFileSync(file, JSON.stringify(data));
    }
    const map = new Map<Era, string[]>();
    for (const [serie, ids] of Object.entries(data)) {
      const era = eraOfSerie(serie);
      if (!era) { continue; }
      map.set(era, [...(map.get(era) ?? []), ...ids]);
      for (const id of ids) { this.setEra.set(id, era); }
    }
    this.eraSets = map;
    return map;
  }

  /** Lista cartas con imagen que cumplen el filtro; undefined si la red falló (distinto de lista vacía). */
  private async list(filter: Record<string, string>): Promise<ListItem[] | undefined> {
    const qs = new URLSearchParams({ ...filter, 'pagination:itemsPerPage': '500' }).toString();
    const hit = this.lists.get(qs);
    if (hit) { return hit; }
    const json = await this.getJson(`${BASE}/cards?${qs}`);
    if (!Array.isArray(json)) { return undefined; }
    const items = json.filter((c: ListItem) => c.image);
    this.lists.set(qs, items);
    return items;
  }

  /** Convierte la respuesta de TCGdex en una carta (undefined si no es una carta de Pokémon con imagen). */
  private parseCard(c: any): Card | undefined {
    if (!c || c.category !== 'Pokemon' || !c.image || !c.name) { return undefined; }
    const holo = !!c.variants?.holo;
    let tier = tierOf(c.rarity);
    if (holo && tier < 3) { tier = 3; } // en lo vintage una holo figura como «Rare»
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

  private cardFile(id: string): string { return path.join(this.dir, 'cards', `${this.safe(id)}.json`); }

  /** Baja la carta de la red y la guarda en disco. undefined si falla. */
  private async fetchCard(id: string): Promise<Card | undefined> {
    const card = this.parseCard(await this.getJson(`${BASE}/cards/${encodeURIComponent(id)}`));
    if (card) { fs.writeFileSync(this.cardFile(id), JSON.stringify(card)); }
    return card;
  }

  async detail(id: string): Promise<Card | undefined> {
    let card: Card | undefined;
    try { card = JSON.parse(fs.readFileSync(this.cardFile(id), 'utf8')); } catch { /* no está en caché */ }
    // Una caché anterior a los ataques y precios se completa cuando hay red; sin red se sigue con lo que hay.
    if (!card || card.cv !== CARD_DATA_VERSION) { card = (await this.fetchCard(id)) ?? card; }
    if (!card) { return undefined; }
    // La era se calcula siempre (no se guarda): así una caché antigua sin era también se actualiza.
    if (card.setId && !card.era) { await this.loadEras(); card.era = this.setEra.get(card.setId); }
    return card;
  }

  /**
   * Completa una carta del álbum con ataques y precio actuales. Si ya está al día (y el precio es reciente, salvo
   * `force`) la devuelve igual; si no hay red devuelve undefined. El resultado conserva la variante del ejemplar.
   */
  async enrich(card: Card, force = false): Promise<Card | undefined> {
    const stale = card.cv !== CARD_DATA_VERSION || (force && Date.now() - (card.priceAt ?? 0) > PRICE_TTL);
    if (!stale) { return card; }
    const fresh = await this.fetchCard(card.id);
    if (!fresh) { return undefined; }
    if (fresh.setId && !fresh.era) { await this.loadEras(); fresh.era = this.setEra.get(fresh.setId); }
    return { ...fresh, era: fresh.era ?? card.era, variant: card.variant };
  }

  /** Ruta local de la imagen (la descarga si hace falta). undefined sin red. */
  async image(card: Card, quality: 'low' | 'high'): Promise<string | undefined> {
    const file = path.join(this.dir, 'img', `${this.safe(card.id)}-${quality}.webp`);
    if (fs.existsSync(file)) { return file; }
    try {
      const res = await fetch(`${card.image}/${quality}.webp`, { signal: AbortSignal.timeout(TIMEOUT) });
      if (!res.ok) { return undefined; }
      const tmp = file + '.part';
      fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
      fs.renameSync(tmp, file);
      return file;
    } catch { return undefined; }
  }

  cachedImage(card: Card, quality: 'low' | 'high'): string | undefined {
    const file = path.join(this.dir, 'img', `${this.safe(card.id)}-${quality}.webp`);
    return fs.existsSync(file) ? file : undefined;
  }

  /** Una carta de la era pedida que cumpla su filtro premium; si no encuentra, prueba otras eras. undefined solo sin red. */
  private async rollCard(era: Era, luck: number): Promise<Card | undefined> {
    const eras = await this.loadEras();
    if (!eras) { return undefined; }
    const order = [era, ...ERAS.map(e => e.id).filter(e => e !== era).sort(() => this.rng() - 0.5)];
    for (const e of order) {
      const def = ERAS.find(x => x.id === e)!;
      const sets = eras.get(e) ?? [];
      if (!sets.length) { continue; }
      const rarities = shuffledRarities(e, this.rng);
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const filter: Record<string, string> = { 'set.id': `eq:${this.pick(sets)}`, rarity: `eq:${rarities[attempt % rarities.length]}` };
        if (def.holoOnly) { filter['variants.holo'] = 'true'; }
        const items = await this.list(filter);
        if (!items) { return undefined; }
        if (!items.length) { continue; }
        const card = await this.detail(this.pick(items).id);
        if (!card || !isPremium(card)) { continue; }
        return { ...card, variant: rollVariant(card, luck, this.rng) };
      }
    }
    return undefined;
  }

  async rollPack(kind: PackKind = 'pack', luck = 0): Promise<Card[]> {
    const cards = await Promise.all(rollEras(kind, luck, this.rng).map(e => this.rollCard(e, luck)));
    return cards.filter((c): c is Card => !!c);
  }

  /** Siguiente carta de la línea (evolveFrom = nombre actual): prefiere las del filtro premium y la rareza más parecida. */
  findNext: FindNext = async card => {
    const all = await this.list({ 'evolveFrom': `eq:${card.name}` });
    if (!all) { return { ok: false }; }
    if (!all.length) { return { ok: true, card: null }; }
    const sample = [...all].sort(() => this.rng() - 0.5).slice(0, 16);
    const cards = (await Promise.all(sample.map(s => this.detail(s.id)))).filter((c): c is Card => !!c);
    if (!cards.length) { return { ok: false }; }
    const score = (c: Card) => (isPremium(c) ? 0 : 100) + Math.abs(c.tier - card.tier) * 3 - (c.tier > card.tier ? 1 : 0);
    cards.sort((a, b) => score(a) - score(b));
    const best = cards[0];
    // La variante Shadowless no se hereda: es un ejemplar concreto, no una línea.
    return { ok: true, card: { ...best, variant: undefined } };
  };
}

