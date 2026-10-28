import * as fs from 'fs';
import * as path from 'path';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const TIMEOUT = 8_000;
const MAX_DEX = 1025;

export type Facing = 'front' | 'back';

/** The animated sprite of a species (Showdown GIF, or the still PNG when there is none), kept on disk like the card art. */
export class Sprites {
  private failed = new Set<string>();   // this session only: a missing sprite is not asked for again on every fight

  constructor(private dir: string, private fetchFn: typeof fetch = fetch) {
    fs.mkdirSync(dir, { recursive: true });
  }

  /** Only a real Pokédex number ever builds a URL or a path. */
  static valid(dexId: unknown): dexId is number { return Number.isInteger(dexId) && (dexId as number) >= 1 && (dexId as number) <= MAX_DEX; }

  private file(dexId: number, facing: Facing, ext: 'gif' | 'png'): string { return path.join(this.dir, `${facing}-${dexId}.${ext}`); }

  private url(dexId: number, facing: Facing, ext: 'gif' | 'png'): string {
    return ext === 'gif' ? `${BASE}/other/showdown/${facing === 'back' ? 'back/' : ''}${dexId}.gif` : `${BASE}/${facing === 'back' ? 'back/' : ''}${dexId}.png`;
  }

  /** The sprite if it is already on disk. */
  cached(dexId: number, facing: Facing): string | undefined {
    if (!Sprites.valid(dexId)) { return undefined; }
    return (['gif', 'png'] as const).map(e => this.file(dexId, facing, e)).find(f => fs.existsSync(f));
  }

  /** Local path of the sprite (downloaded if needed). undefined when offline or the species has none. */
  async get(dexId: number, facing: Facing): Promise<string | undefined> {
    if (!Sprites.valid(dexId)) { return undefined; }
    const hit = this.cached(dexId, facing);
    if (hit) { return hit; }
    const id = `${facing}-${dexId}`;
    if (this.failed.has(id)) { return undefined; }
    for (const ext of ['gif', 'png'] as const) {
      try {
        const res = await this.fetchFn(this.url(dexId, facing, ext), { signal: AbortSignal.timeout(TIMEOUT) });
        if (!res.ok) { continue; }
        const file = this.file(dexId, facing, ext);
        const tmp = file + '.part';
        fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
        fs.renameSync(tmp, file);
        return file;
      } catch { /* try the next format */ }
    }
    this.failed.add(id);
    return undefined;
  }
}
