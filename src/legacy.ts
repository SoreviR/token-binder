/**
 * TokenBinder used to be called PokeToken (id `sorevir.poke-token`). VS Code ties progress and settings to the
 * extension id, so a rename would "lose" them. Everything is recovered from the old version here, just once.
 */
export const LEGACY = {
  extId: 'sorevir.poke-token',
  section: 'pokeToken',
  keys: { game: 'pokeToken.game.v2', stamps: 'pokeToken.stamps.v1', alerts: 'pokeToken.alerts.v1' },
} as const;

export interface LegacyState { game?: unknown; stamps?: unknown; alerts?: unknown }

/** Extracts the old version's state from the JSON VS Code stores per extension. Returns {} if it is not valid. */
export function parseLegacyState(json: string | undefined): LegacyState {
  if (!json) { return {}; }
  try {
    const o = JSON.parse(json);
    const game = o?.[LEGACY.keys.game];
    // Only the card game (v2); the sprite game (v1) is not compatible.
    return {
      game: game && game.v === 2 && typeof game.collection === 'object' ? game : undefined,
      stamps: o?.[LEGACY.keys.stamps], alerts: o?.[LEGACY.keys.alerts],
    };
  } catch { return {}; }
}
