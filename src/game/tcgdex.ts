import * as fs from 'fs';
import * as path from 'path';
import { CARD_DATA_VERSION, Card, ERAS, Era, FindNext, PackKind, eraOfSerie, isPremium, rollEras, rollVariant, shuffledRarities, tierOf } from './engine';
import { parseCard } from './cardData';
import { SPOOKY, SPOOKY_CARDS } from './halloween';
import { Transform, baseName, transformNames } from './items';

const BASE = 'https://api.tcgdex.net/v2/en';
const TIMEOUT = 12_000;
const PRICE_TTL = 7 * 864e5;  // the price is fetched again when viewing a card if it is more than 7 days old
const MAX_ATTEMPTS = 14; // (set, rarity) attempts per card before falling back to another era

interface ListItem { id: string; name: string; image?: string }

/** Minimal TCGdex client (https://tcgdex.dev, no key). Everything downloaded is kept on disk. */
export class Tcgdex {
  private lists = new Map<string, ListItem[]>();
  private eraSets?: Map<Era, string[]>;       // era → set ids
  private setEra = new Map<string, Era>();    // set id → era

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

  /** Which sets belong to each era (downloaded once and saved on disk). undefined when there is neither network nor cache. */
  private async loadEras(offline = false): Promise<Map<Era, string[]> | undefined> {
    if (this.eraSets) { return this.eraSets; }
    const file = path.join(this.dir, 'eras.json');
    let data: Record<string, string[]> | undefined;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* no cache */ }
    if (!data) {
      if (offline) { return undefined; }
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

  /** Lists cards with an image that match the filter; undefined if the network failed (different from an empty list). */
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

  private parseCard(c: any): Card | undefined { return parseCard(c); }

  private cardFile(id: string): string { return path.join(this.dir, 'cards', `${this.safe(id)}.json`); }

  /** Downloads the card and saves it on disk. undefined on failure. */
  private async fetchCard(id: string): Promise<Card | undefined> {
    const card = this.parseCard(await this.getJson(`${BASE}/cards/${encodeURIComponent(id)}`));
    if (card) { fs.writeFileSync(this.cardFile(id), JSON.stringify(card)); }
    return card;
  }

  async detail(id: string): Promise<Card | undefined> {
    let card: Card | undefined;
    try { card = JSON.parse(fs.readFileSync(this.cardFile(id), 'utf8')); } catch { /* not cached */ }
    // A cache from before attacks and prices is completed when there is a network; offline we carry on with what we have.
    if (!card || card.cv !== CARD_DATA_VERSION) { card = (await this.fetchCard(id)) ?? card; }
    if (!card) { return undefined; }
    // The era is always computed (not stored), so an old cache without an era is updated too.
    if (card.setId && !card.era) { await this.loadEras(); card.era = this.setEra.get(card.setId); }
    return card;
  }

  /**
   * Fills in an album card with current attacks and price. If it is already up to date (and the price is recent,
   * unless `force`) it is returned as is; with no network it returns undefined. The result keeps the copy's variant.
   */
  async enrich(card: Card, force = false): Promise<Card | undefined> {
    const stale = card.cv !== CARD_DATA_VERSION || (force && Date.now() - (card.priceAt ?? 0) > PRICE_TTL);
    if (!stale) { return card; }
    const fresh = await this.fetchCard(card.id);
    if (!fresh) { return undefined; }
    if (fresh.setId && !fresh.era) { await this.loadEras(); fresh.era = this.setEra.get(fresh.setId); }
    return { ...fresh, era: fresh.era ?? card.era, variant: card.variant };
  }

  /** Local path of the image (downloaded if needed). undefined when offline. */
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

  /** A card of the requested era that passes its premium filter; if none is found, other eras are tried. undefined only when offline. */
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

  /** Halloween pack: ghost and dark species, the premium cards of each first (the rarer one when the species has several). */
  private async rollSpooky(luck: number): Promise<Card[]> {
    const names = [...SPOOKY].sort(() => this.rng() - 0.5).slice(0, SPOOKY_CARDS);
    const cards = await Promise.all(names.map(async (name, i): Promise<Card | undefined> => {
      const items = await this.list({ name: `eq:${name}` });
      if (!items?.length) { return undefined; }
      const best = await this.bestOf(items, { tier: i === 0 ? 3 : 4 } as Card);
      return best ? { ...best, variant: rollVariant(best, luck, this.rng) } : undefined;
    }));
    return cards.filter((c): c is Card => !!c);
  }

  async rollPack(kind: PackKind = 'pack', luck = 0): Promise<Card[]> {
    if (kind === 'spooky') { return this.rollSpooky(luck); }
    const cards = await Promise.all(rollEras(kind, luck, this.rng).map(e => this.rollCard(e, luck)));
    return cards.filter((c): c is Card => !!c);
  }

  /** The candidate that suits `ref` best: passing the premium filter first, then the most similar rarity. undefined when none can be read. */
  private async bestOf(items: ListItem[], ref: Card, accept: (c: Card) => boolean = () => true): Promise<Card | undefined> {
    const sample = [...items].sort(() => this.rng() - 0.5).slice(0, 16);
    const cards = (await Promise.all(sample.map(s => this.detail(s.id)))).filter((c): c is Card => !!c && accept(c));
    const score = (c: Card) => (isPremium(c) ? 0 : 100) + Math.abs(c.tier - ref.tier) * 3 - (c.tier > ref.tier ? 1 : 0);
    cards.sort((a, b) => score(a) - score(b));
    return cards[0];
  }

  /**
   * Next card in the line (evolveFrom = current name). When the line branches into several species and none was picked
   * it returns the species to choose from instead. `pick` selects one species.
   */
  findNext: FindNext = async (card, pick) => {
    const all = await this.list({ 'evolveFrom': `eq:${card.name}` });
    if (!all) { return { ok: false }; }
    if (!all.length) { return { ok: true, card: null }; }
    const species = [...new Set(all.map(i => baseName(i.name)))];
    if (!pick && species.length > 1) { return { ok: true, branches: species }; }
    const pool = pick ? all.filter(i => baseName(i.name) === pick) : all;
    const best = await this.bestOf(pool.length ? pool : all, card);
    if (!best) { return { ok: false }; }
    // The Shadowless variant is not inherited: it is a specific copy, not a line.
    return { ok: true, card: { ...best, variant: undefined } };
  };

  /** The ace card of a leader if it is already on disk. Never touches the network (the panel asks for this on every refresh). */
  async cachedLeaderCard(leaderId: string): Promise<Card | undefined> {
    let id: string | undefined;
    try { id = JSON.parse(fs.readFileSync(path.join(this.dir, 'leaders.json'), 'utf8'))[leaderId]; } catch { return undefined; }
    if (!id) { return undefined; }
    let card: Card;
    try { card = JSON.parse(fs.readFileSync(this.cardFile(id), 'utf8')); } catch { return undefined; }
    if (card.setId && !card.era) { await this.loadEras(true); card.era = this.setEra.get(card.setId); }
    return card;
  }

  /**
   * The ace card of a gym leader: found by species name (the premium ones first) the first time and then remembered in
   * `leaders.json`, so every leader is always the same card. undefined when offline and not seen before.
   */
  async leaderCard(leaderId: string, species: string): Promise<Card | undefined> {
    const file = path.join(this.dir, 'leaders.json');
    let known: Record<string, string> = {};
    try { known = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* nothing remembered yet */ }
    if (known[leaderId]) {
      const cached = await this.detail(known[leaderId]);
      if (cached) { return cached; }
    }
    const items = await this.list({ name: `eq:${species}` });
    if (!items?.length) { return undefined; }
    const ref = { tier: 3 } as Card;   // a holographic card is the model: premium cards score best, then the closest rarity
    const best = await this.bestOf(items, ref);
    if (!best) { return undefined; }
    known[leaderId] = best.id;
    fs.writeFileSync(file, JSON.stringify(known));
    return { ...best, variant: undefined };
  }

  /** The transformed version of a card (Mega, VMAX…): a card with the matching name. card: null when none exists. */
  async findTransform(card: Card, kind: Transform): Promise<{ ok: true; card: Card | null } | { ok: false }> {
    const found: ListItem[] = [];
    for (const name of transformNames(baseName(card.name), kind)) {
      const items = await this.list({ name: `eq:${name}` });
      if (!items) { return { ok: false }; }
      found.push(...items.filter(i => i.id !== card.id));
    }
    if (!found.length) { return { ok: true, card: null }; }
    // Terastal cards are the Scarlet & Violet "ex"; older eras also had cards called "ex" that are not the same thing.
    const best = await this.bestOf(found, card, c => kind !== 'tera' || c.era === 'current');
    if (!best && kind === 'tera') { return { ok: true, card: null }; }
    return best ? { ok: true, card: { ...best, variant: undefined } } : { ok: false };
  }
}

