/**
 * TokenBinder se llamaba antes PokeToken (id `sorevir.poke-token`). VS Code ata el progreso y los ajustes al id
 * de la extensión, así que al renombrar se «perderían». Aquí se recupera todo de la versión antigua, una sola vez.
 */
export const LEGACY = {
  extId: 'sorevir.poke-token',
  section: 'pokeToken',
  keys: { game: 'pokeToken.game.v2', stamps: 'pokeToken.stamps.v1', alerts: 'pokeToken.alerts.v1' },
} as const;

export interface LegacyState { game?: unknown; stamps?: unknown; alerts?: unknown }

/** Extrae el estado de la versión antigua del JSON que VS Code guarda por extensión. Devuelve {} si no es válido. */
export function parseLegacyState(json: string | undefined): LegacyState {
  if (!json) { return {}; }
  try {
    const o = JSON.parse(json);
    const game = o?.[LEGACY.keys.game];
    // Solo el juego de cartas (v2); el de sprites (v1) no es compatible.
    return {
      game: game && game.v === 2 && typeof game.collection === 'object' ? game : undefined,
      stamps: o?.[LEGACY.keys.stamps], alerts: o?.[LEGACY.keys.alerts],
    };
  } catch { return {}; }
}
