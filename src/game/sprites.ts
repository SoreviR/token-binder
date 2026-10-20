import * as fs from 'fs';
import * as path from 'path';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white';

/** Sprite animado Gen 5 como data URI. Se descarga una vez y se guarda en disco; sin red devuelve undefined. */
export async function getSprite(cacheDir: string, id: number, shiny: boolean): Promise<string | undefined> {
  const file = path.join(cacheDir, `${shiny ? 's' : 'n'}${id}.gif`);
  try {
    if (fs.existsSync(file)) { return toUri(fs.readFileSync(file)); }
    const res = await fetch(`${BASE}/animated/${shiny ? 'shiny/' : ''}${id}.gif`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) { return undefined; }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(file, buf);
    return toUri(buf);
  } catch {
    return undefined;
  }
}

const toUri = (b: Buffer) => `data:image/gif;base64,${b.toString('base64')}`;
