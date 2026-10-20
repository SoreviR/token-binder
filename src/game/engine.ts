// Motor del compañero: huevo → eclosión → evoluciones → graduación a la Pokédex.
// Puro y sin dependencias de VS Code para poder testearlo.

export interface Species { id: number; name: string }
export type Line = Species[];

/** Líneas evolutivas Gen 1-5 incluidas offline (id de PokéAPI). */
export const LINES: Line[] = [
  [[1, 'Bulbasaur'], [2, 'Ivysaur'], [3, 'Venusaur']], [[4, 'Charmander'], [5, 'Charmeleon'], [6, 'Charizard']],
  [[7, 'Squirtle'], [8, 'Wartortle'], [9, 'Blastoise']], [[25, 'Pikachu'], [26, 'Raichu']],
  [[63, 'Abra'], [64, 'Kadabra'], [65, 'Alakazam']], [[66, 'Machop'], [67, 'Machoke'], [68, 'Machamp']],
  [[74, 'Geodude'], [75, 'Graveler'], [76, 'Golem']], [[92, 'Gastly'], [93, 'Haunter'], [94, 'Gengar']],
  [[129, 'Magikarp'], [130, 'Gyarados']], [[133, 'Eevee']], [[143, 'Snorlax']],
  [[147, 'Dratini'], [148, 'Dragonair'], [149, 'Dragonite']], [[152, 'Chikorita'], [153, 'Bayleef'], [154, 'Meganium']],
  [[155, 'Cyndaquil'], [156, 'Quilava'], [157, 'Typhlosion']], [[158, 'Totodile'], [159, 'Croconaw'], [160, 'Feraligatr']],
  [[246, 'Larvitar'], [247, 'Pupitar'], [248, 'Tyranitar']], [[252, 'Treecko'], [253, 'Grovyle'], [254, 'Sceptile']],
  [[255, 'Torchic'], [256, 'Combusken'], [257, 'Blaziken']], [[258, 'Mudkip'], [259, 'Marshtomp'], [260, 'Swampert']],
  [[280, 'Ralts'], [281, 'Kirlia'], [282, 'Gardevoir']], [[387, 'Turtwig'], [388, 'Grotle'], [389, 'Torterra']],
  [[390, 'Chimchar'], [391, 'Monferno'], [392, 'Infernape']], [[393, 'Piplup'], [394, 'Prinplup'], [395, 'Empoleon']],
  [[443, 'Gible'], [444, 'Gabite'], [445, 'Garchomp']], [[447, 'Riolu'], [448, 'Lucario']],
  [[495, 'Snivy'], [496, 'Servine'], [497, 'Serperior']], [[498, 'Tepig'], [499, 'Pignite'], [500, 'Emboar']],
  [[501, 'Oshawott'], [502, 'Dewott'], [503, 'Samurott']],
].map(l => l.map(([id, name]) => ({ id: id as number, name: name as string })));

export const NATURES = ['Hardy', 'Brave', 'Adamant', 'Naughty', 'Bold', 'Docile', 'Relaxed', 'Impish', 'Lax', 'Timid', 'Hasty', 'Serious', 'Jolly', 'Naive', 'Modest', 'Mild', 'Quiet', 'Bashful', 'Rash', 'Calm', 'Gentle', 'Sassy', 'Careful', 'Quirky'];

export interface Pokemon {
  lineIdx: number;
  shiny: boolean;
  nature: string;
  born: number;        // tokens de por vida al nacer el huevo (+ bonificaciones)
}
export interface DexEntry { id: number; name: string; shiny: boolean; nature: string; at: number }
export interface GameState { current: Pokemon; dex: DexEntry[]; candyPeriod: number; hatchedCount: number }

const HATCH = 150_000;
const EVO = [1_500_000, 6_000_000];
const GRADUATE_AFTER = 8_000_000;

/** Umbrales acumulados: [eclosión, evo1, evo2…, graduación] ya multiplicados. */
export function thresholds(lineLen: number, mult: number): number[] {
  const t = [HATCH];
  for (let i = 0; i < lineLen - 1; i++) { t.push(EVO[i]); }
  t.push(t[t.length - 1] + GRADUATE_AFTER);
  return t.map(v => Math.round(v * mult));
}

export function spawn(born: number, rng: () => number = Math.random, shinyOdds = 1 / 512): Pokemon {
  return {
    lineIdx: Math.floor(rng() * LINES.length),
    shiny: rng() < shinyOdds,
    nature: NATURES[Math.floor(rng() * NATURES.length)],
    born,
  };
}

export interface Progress {
  stage: number;          // 0 = huevo, 1.. = índice de la especie + 1
  species?: Species;
  into: number;           // tokens consumidos dentro de la etapa actual
  span: number;           // tokens que dura la etapa actual
  pct: number;            // 0-100
  graduated: boolean;
}

export function progressOf(p: Pokemon, lifetime: number, mult: number): Progress {
  const line = LINES[p.lineIdx];
  const th = thresholds(line.length, mult);
  const acc = Math.max(0, lifetime - p.born);
  if (acc >= th[th.length - 1]) {
    return { stage: line.length, species: line[line.length - 1], into: 1, span: 1, pct: 100, graduated: true };
  }
  let stage = 0;
  while (stage < th.length - 1 && acc >= th[stage]) { stage++; }
  const start = stage === 0 ? 0 : th[stage - 1];
  const span = th[stage] - start;
  const into = acc - start;
  return { stage, species: stage === 0 ? undefined : line[stage - 1], into, span, pct: Math.min(100, (into / span) * 100), graduated: false };
}

export interface AdvanceResult { state: GameState; events: string[] }

/** Aplica graduaciones pendientes y la Rare Candy del periodo. Devuelve eventos para la UI. */
export function advance(prev: GameState, lifetime: number, mult: number, periodKey: number, quotaPct: number, rng: () => number = Math.random): AdvanceResult {
  const state: GameState = { ...prev, current: { ...prev.current }, dex: [...prev.dex] };
  const events: string[] = [];
  if (quotaPct >= 100 && state.candyPeriod !== periodKey) {
    state.candyPeriod = periodKey;
    state.current.born -= Math.round(2_000_000 * mult);
    events.push('candy');
  }
  const startStage = progressOf(state.current, lifetime, mult).stage;
  for (let guard = 0; guard < 50; guard++) {
    const pr = progressOf(state.current, lifetime, mult);
    if (!pr.graduated) { break; }
    const line = LINES[state.current.lineIdx];
    const sp = line[line.length - 1];
    state.dex.push({ id: sp.id, name: sp.name, shiny: state.current.shiny, nature: state.current.nature, at: Date.now() });
    events.push(`graduate:${sp.name}`);
    const consumed = thresholds(line.length, mult).slice(-1)[0];
    state.current = spawn(state.current.born + consumed, rng);
  }
  const endStage = progressOf(state.current, lifetime, mult).stage;
  if (state.current.born === prev.current.born && endStage > startStage) {
    events.push(startStage === 0 ? 'hatch' : 'evolve');
  } else if (state.current.born !== prev.current.born && !events.some(e => e === 'candy') && endStage > 0) {
    events.push('hatch');
  }
  return { state, events };
}
