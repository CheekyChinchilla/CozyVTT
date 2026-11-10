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
import { MAX_ABILITY_SCORE, MIN_ABILITY_SCORE } from '../utils/rules/dnd5e';

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
   * system shares them: Pathfinder 2e's pass +33 at high level, so a bound
   * fitted to D&D 5e would refuse real creatures. A backstop, not a rules check.
   * A Call of Cthulhu creature's skills have their own highest, below.
   */
  minBonus: -50,
  maxBonus: 50,
  /** The most saves, or the most skills, one stat block may carry. */
  maxBonusEntries: 60,
  /** The longest name of a save or skill. */
  maxBonusKeyLength: 50,
  /**
   * The highest characteristic a Call of Cthulhu creature may hold in one of
   * the six score slots. An investigator's run to 99 and creatures go far
   * past that: checked against the Call of Cthulhu core rulebook, its largest
   * creature can roll STR 5,000 and SIZ 5,500, and its gods have CON 2,000.
   * Four digits hold every one of them. A backstop, not a rules check.
   */
  maxCallOfCthulhuCharacteristic: 9999,
  /**
   * The highest skill a Call of Cthulhu creature may hold. Skills are
   * percentages; the rulebook's creatures reach 100%, and nothing in the rules
   * stops one going higher, so three digits.
   */
  maxCallOfCthulhuSkill: 999,
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
 * the stat block names. A Call of Cthulhu creature keeps its characteristics in
 * the score slots and its skills as percentages, so its bounds are wider. Every
 * other system, and a stat block that names none, keeps D&D 5e's scores and the
 * skill bound every system shares.
 */
export function statBlockNumberBounds(gameSystem: string | null | undefined): StatBlockNumberBounds {
  const callOfCthulhu = gameSystem === 'CALL_OF_CTHULHU_7E';
  return {
    minScore: MIN_ABILITY_SCORE,
    maxScore: callOfCthulhu ? STAT_BLOCK_LIMITS.maxCallOfCthulhuCharacteristic : MAX_ABILITY_SCORE,
    minSkill: STAT_BLOCK_LIMITS.minBonus,
    maxSkill: callOfCthulhu ? STAT_BLOCK_LIMITS.maxCallOfCthulhuSkill : STAT_BLOCK_LIMITS.maxBonus,
  };
}
