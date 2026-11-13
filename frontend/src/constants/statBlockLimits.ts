// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * The limits on what a creature, token template or stat block says in words:
 * names, the stat block's text fields and its lists of traits and actions;
 * and on the numbers its scores and skills may hold.
 *
 * The server refuses a creature, template or token over them and the forms
 * stop each box at them. This file exists twice, as
 * backend/src/validators/statBlockLimits.ts and
 * frontend/src/constants/statBlockLimits.ts, and a test keeps the two copies
 * identical, so a form never allows what the server refuses.
 */
import { MAX_ABILITY_SCORE, MIN_ABILITY_SCORE } from '../utils/rules/fifthEdition';

export const STAT_BLOCK_LIMITS = {
  /** The longest name a creature or token template may have. */
  maxNameLength: 200,
  /** The longest creature type, such as "Small humanoid (goblinoid)". */
  maxCreatureTypeLength: 200,
  /** The longest alignment. */
  maxAlignmentLength: 100,
  /** The longest challenge rating. */
  maxChallengeRatingLength: 10,
  /** The longest hit dice, such as "2d6". */
  maxHitDiceLength: 50,
  /** The longest speed. */
  maxSpeedLength: 200,
  /** The longest damage vulnerabilities, resistances, immunities, condition immunities, senses or languages. */
  maxDetailLength: 500,
  /** The most entries in each list of traits, actions, bonus actions, reactions or legendary actions. */
  maxListEntries: 50,
  /** The longest name of a trait or action. */
  maxEntryNameLength: 200,
  /** The longest description of a trait or action. */
  maxEntryDescriptionLength: 5000,
  /** The longest notes on a stat block or token template. */
  maxNotesLength: 5000,
  /**
   * The lowest and highest total a save or skill may hold. Wide, because every
   * system shares them: Fantasy d20's pass +33 at high level, so a bound
   * fitted to 5E would refuse real creatures. A backstop, not a rules check.
   * A Horror d100 creature's skills have their own highest, below.
   */
  minBonus: -50,
  maxBonus: 50,
  /** The most saves, or the most skills, one stat block may carry. */
  maxBonusEntries: 60,
  /** The longest name of a save or skill. */
  maxBonusKeyLength: 50,
  /**
   * The highest characteristic a Horror d100 creature may hold in one of
   * the six score slots. A character's seldom pass 21, and the largest
   * creatures of the open d100 rules reach the low hundreds in STR, SIZ or
   * CON. Three digits hold every one of them, as they hold a character's on
   * its sheet. A backstop, not a rules check.
   */
  maxHorrorD100Characteristic: 999,
  /**
   * The highest skill a Horror d100 creature may hold. Skills are
   * percentages; a creature's can reach 100%, and nothing in the rules stops
   * one going higher, so three digits.
   */
  maxHorrorD100Skill: 999,
} as const;

/** The lowest and highest score and skill a stat block may hold. */
export interface StatBlockNumberBounds {
  minScore: number;
  maxScore: number;
  minSkill: number;
  maxSkill: number;
}

/**
 * The bounds on a stat block's six scores and its skills, by the game system
 * the stat block names. A Horror d100 creature keeps its characteristics in
 * the score slots and its skills as percentages, so its bounds are wider. Every
 * other system, and a stat block that names none, keeps 5E's scores and the
 * skill bound every system shares.
 */
export function statBlockNumberBounds(gameSystem: string | null | undefined): StatBlockNumberBounds {
  const horrorD100 = gameSystem === 'HORROR_D100';
  return {
    minScore: MIN_ABILITY_SCORE,
    maxScore: horrorD100 ? STAT_BLOCK_LIMITS.maxHorrorD100Characteristic : MAX_ABILITY_SCORE,
    minSkill: STAT_BLOCK_LIMITS.minBonus,
    maxSkill: horrorD100 ? STAT_BLOCK_LIMITS.maxHorrorD100Skill : STAT_BLOCK_LIMITS.maxBonus,
  };
}
