import * as fs from 'fs';
import * as path from 'path';
import { Card, FindNext, PackKind, TIER_RARITIES, rollTiers, tierOf } from './engine';

const BASE = 'https://api.tcgdex.net/v2/en';
const MAX_DEX = 1025;
const TIMEOUT = 12_000;

interface ListItem { id: string; name: string; image?: string }

/** Cliente mínimo de TCGdex (https://tcgdex.dev, sin clave). Todo lo descargado queda en disco. */
export class Tcgdex {
  private lists = new Map<string, ListItem[]>();
  constructor(private dir: string, private rng: () => number = Math.random) {
    fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'cards'), { recursive: true });
  }

  private pick<T>(a: T[]): T { return a[Math.floor(this.rng() * a.length)]; }

  private async getJson(url: string): Promise<any | undefined> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
      if (!res.ok) { return undefined; }
      return await res.json();
    } catch { return undefined; }
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

  async detail(id: string): Promise<Card | undefined> {
    const file = path.join(this.dir, 'cards', `${id.replace(/[^\w.-]/g, '_')}.json`);
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* no está en caché */ }
    const c = await this.getJson(`${BASE}/cards/${encodeURIComponent(id)}`);
    if (!c || c.category !== 'Pokemon' || !c.image || !c.name) { return undefined; }
    const card: Card = {
      id: c.id, name: c.name, rarity: c.rarity ?? 'Common', tier: tierOf(c.rarity), stage: c.stage, evolveFrom: c.evolveFrom,
      dexId: Array.isArray(c.dexId) ? c.dexId[0] : undefined, hp: typeof c.hp === 'number' ? c.hp : undefined,
      types: c.types, set: c.set?.name, image: c.image,
    };
    fs.writeFileSync(file, JSON.stringify(card));
    return card;
  }

  /** Ruta local de la imagen (la descarga si hace falta). undefined sin red. */
  async image(card: Card, quality: 'low' | 'high'): Promise<string | undefined> {
    const file = path.join(this.dir, 'img', `${card.id.replace(/[^\w.-]/g, '_')}-${quality}.webp`);
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
    const file = path.join(this.dir, 'img', `${card.id.replace(/[^\w.-]/g, '_')}-${quality}.webp`);
    return fs.existsSync(file) ? file : undefined;
  }

  /** Una carta de la categoría `tier`; si no hay, baja de categoría. undefined solo si no hay red. */
  private async rollCard(tier: number): Promise<Card | undefined> {
    for (let t = tier; t >= 0; t--) {
      const rarities = [...TIER_RARITIES[t]].sort(() => this.rng() - 0.5);
      for (const rarity of rarities) {
        // 1) especie al azar + rareza (rápido y variado). 2) listado por rareza como respaldo.
        for (let attempt = 0; attempt < 4; attempt++) {
          const items = await this.list({ dexId: `eq:${1 + Math.floor(this.rng() * MAX_DEX)}`, rarity: `eq:${rarity}` });
          if (!items) { return undefined; }
          if (items.length) {
            const c = await this.detail(this.pick(items).id);
            if (c) { return c; }
          }
        }
        const items = await this.list({ rarity: `eq:${rarity}` });
        if (!items) { return undefined; }
        for (let i = 0; i < 3 && items.length; i++) {
          const c = await this.detail(this.pick(items).id);
          if (c) { return c; }
        }
      }
    }
    return undefined;
  }

  async rollPack(kind: PackKind = 'pack', luck = 0): Promise<Card[]> {
    const cards = await Promise.all(rollTiers(kind, luck, this.rng).map(t => this.rollCard(t)));
    return cards.filter((c): c is Card => !!c);
  }

  /** Siguiente carta de la línea (evolveFrom = nombre actual), prefiriendo la misma rareza. */
  findNext: FindNext = async card => {
    const exact = await this.list({ evolveFrom: `eq:${card.name}`, rarity: `eq:${card.rarity}` });
    if (!exact) { return { ok: false }; }
    if (exact.length) {
      const c = await this.detail(this.pick(exact).id);
      if (c) { return { ok: true, card: c }; }
    }
    const all = await this.list({ evolveFrom: `eq:${card.name}` });
    if (!all) { return { ok: false }; }
    if (!all.length) { return { ok: true, card: null }; }
    // Sin la misma rareza: de una muestra, la categoría más cercana (a igualdad, la más alta).
    const sample = [...all].sort(() => this.rng() - 0.5).slice(0, 8);
    const cards = (await Promise.all(sample.map(s => this.detail(s.id)))).filter((c): c is Card => !!c);
    if (!cards.length) { return { ok: false }; }
    cards.sort((a, b) => Math.abs(a.tier - card.tier) - Math.abs(b.tier - card.tier) || b.tier - a.tier);
    return { ok: true, card: cards[0] };
  };
}
