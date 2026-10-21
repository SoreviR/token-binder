// Strength model of a fighter. The idea: with thousands of cards whose printed HP and damage differ wildly, what is printed
// on the card must NOT decide a fight. A fighter's power is a product of small, visible factors (training level above all,
// market demand, rarity, care, a token-usage bonus), and the printed numbers only give personality, compressed to ±15%.
// Pure: no VS Code or network, so the same code can run in the extension and, later, on a server.
import type { Card, Era } from './engine';
import { levelOf } from './engine';
import { COLLECTOR_CLASSES, collectorLabel } from './market';

export type StageClass = 'basic' | 'stage1' | 'stage2' | 'special';

/** ex / GX / V / VMAX / VSTAR / Mega / BREAK / LEVEL-UP: the "special" cards, by stage or by name. */
export function stageClass(card: Pick<Card, 'name' | 'stage'>): StageClass {
  const st = card.stage ?? '';
  if (['VMAX', 'VSTAR', 'MEGA', 'BREAK', 'LEVEL-UP', 'V-UNION'].includes(st) || /\s(?:ex|GX|V)$|-(?:EX|GX)$|^M\s/i.test(card.name)) { return 'special'; }
  if (st === 'Stage2') { return 'stage2'; }
  if (st === 'Stage1') { return 'stage1'; }
  return 'basic';
}

/**
 * Typical printed HP by era and stage (medians measured on test/fixtures/battle-corpus.json). A card is compared with its
 * own class, never with the whole game, so a 320 HP VMAX and a 70 HP vintage basic both end up "about average".
 */
const HP_REF: Record<Era, Record<StageClass, number>> = {
  vintage: { basic: 70, stage1: 70, stage2: 90, special: 100 },
  classic: { basic: 80, stage1: 90, stage2: 130, special: 120 },
  bwxy: { basic: 130, stage1: 120, stage2: 140, special: 170 },
  modern: { basic: 130, stage1: 130, stage2: 140, special: 220 },
  current: { basic: 70, stage1: 110, stage2: 140, special: 240 },
};
/** Typical max printed damage is about half the typical HP in every class (measured on the corpus). */
const DMG_PER_HP = 0.5;

export const hpRef = (card: Pick<Card, 'era' | 'name' | 'stage'>): number => HP_REF[card.era ?? 'classic'][stageClass(card)];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/* ───────── Strength factors ───────── */

/** Demand class 0-5 (Common … Grail). Without a price it is estimated from the rarity category. */
export function demandClass(card: Pick<Card, 'price' | 'tier'>): number {
  const label = collectorLabel(card);
  if (label) { return COLLECTOR_CLASSES.indexOf(label); }
  return [0, 0, 1, 2, 3, 4, 5][clamp(card.tier ?? 2, 0, 6)];
}

export const LEVEL_STEP = 0.018;       // +1.8% strength per level (level 50 = x1.88)
export const DEMAND_STEP = 0.02;       // +2% per demand class (up to +10%)
export const RARITY_STEP = 0.003;      // +0.3% per rarity category (up to +1.8%)
export const GRADE_STEP = 0.008;       // +0.8% per grade point above 5 (a 10 = +4%)
export const MAX_TOKENS_BONUS = 0.08;  // the token-usage bonus never exceeds +8%

export interface StrengthBreakdown { level: number; demand: number; rarity: number; stage: number; grade: number; tokens: number; total: number }

const STAGE_FACTOR: Record<StageClass, number> = { basic: 1, stage1: 1.02, stage2: 1.04, special: 1.04 };

export interface StrengthOptions {
  grade?: number;           // 1-10 from the grading service
  tokensBonus?: number;     // 0-0.08, see tokensBonus()
  levelCap?: number;        // a cup's level limit, when playing in one
  flat?: boolean;           // ignore demand, rarity and stage: lets the balance tools isolate the effect of the printed data
  demandClass?: number;     // fixes the demand class (0-5) instead of reading it from the card: used for the gym leaders
}

/** Strength S of a card at a given level: 1.0 is an ordinary level-1 card. Every factor is reported for the UI. */
export function strengthOf(card: Pick<Card, 'price' | 'tier' | 'name' | 'stage'>, level: number, opts: StrengthOptions = {}): StrengthBreakdown {
  const lv = Math.min(level, opts.levelCap ?? Infinity);
  const f = {
    level: 1 + LEVEL_STEP * (Math.max(1, lv) - 1),
    demand: opts.flat ? 1 : 1 + DEMAND_STEP * (opts.demandClass ?? demandClass(card)),
    rarity: opts.flat ? 1 : 1 + RARITY_STEP * clamp(card.tier ?? 0, 0, 6),
    stage: opts.flat ? 1 : STAGE_FACTOR[stageClass(card)],
    grade: opts.grade && opts.grade > 5 ? 1 + GRADE_STEP * (Math.min(10, opts.grade) - 5) : 1,
    tokens: 1 + clamp(opts.tokensBonus ?? 0, 0, MAX_TOKENS_BONUS),
  };
  return { ...f, total: f.level * f.demand * f.rarity * f.stage * f.grade * f.tokens };
}

/**
 * Bonus for the player who has used LESS of the monthly quota (and so is probably less trained): +2% per 25 points of
 * difference, at most +8%. Self-declared, which is why it is small.
 */
export function tokensBonus(myQuotaPct: number, rivalQuotaPct: number): number {
  const steps = Math.floor((rivalQuotaPct - myQuotaPct) / 25);
  return clamp(steps * 0.02, 0, MAX_TOKENS_BONUS);
}

/* ───────── Character: what the card prints, compressed ───────── */

export interface Character { hp: number; atk: number; def: number; spd: number }

/**
 * Personality of a card, which changes HOW it fights but not HOW STRONG it is: a card with more HP than damage (for its
 * class) leans tanky, the opposite leans hard-hitting. HP × ATK stays 1.0, so the total power is untouched. Missing data
 * counts as average. Speed only shifts who tends to act first by a hair.
 */
export function characterOf(card: Pick<Card, 'era' | 'name' | 'stage' | 'hp' | 'attacks' | 'retreat'>): Character {
  const ref = hpRef(card);
  const maxDmg = Math.max(0, ...(card.attacks ?? []).map(a => a.damage));
  const retreat = typeof card.retreat === 'number' ? card.retreat : 1;
  const hpRel = card.hp ? clamp(card.hp / ref, 0.85, 1.15) : 1;
  const atkRel = maxDmg > 0 ? clamp(maxDmg / (ref * DMG_PER_HP), 0.85, 1.15) : 1;
  const tilt = Math.sqrt(hpRel / atkRel);
  return { hp: tilt, atk: 1 / tilt, def: 1, spd: clamp(1.04 - 0.02 * retreat, 0.96, 1.04) };
}

/* ───────── Combat stats ───────── */

export const BASE_HP = 100;
export const BASE_ATK = 30;
export const BASE_DEF = 50;
export const BASE_SPD = 100;

export interface CombatStats { hp: number; atk: number; def: number; spd: number; level: number }

/**
 * Final stats. Strength is split between HP and ATK (√S each) so a fighter twice as strong takes twice as long to beat and
 * hits twice as hard in total effect. Defence and speed are pure personality.
 */
export function combatStats(card: Card, xp: number, opts: StrengthOptions = {}): { stats: CombatStats; strength: StrengthBreakdown } {
  const level = Math.min(levelOf(xp), opts.levelCap ?? Infinity);
  const strength = strengthOf(card, level, opts);
  const ch = characterOf(card);
  const root = Math.sqrt(strength.total);
  return {
    strength,
    stats: {
      level,
      hp: Math.round(BASE_HP * ch.hp * root),
      atk: Math.round(BASE_ATK * ch.atk * root * 100) / 100,
      def: Math.round(BASE_DEF * ch.def),
      spd: Math.round(BASE_SPD * ch.spd),
    },
  };
}
