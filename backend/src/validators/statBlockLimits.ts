/**
 * The limits on what a creature, token template or stat block says in words:
 * names, the stat block's text fields and its lists of traits and actions.
 *
 * The server refuses a creature, template or token over them and the forms
 * stop each box at them. This file exists twice, as
 * backend/src/validators/statBlockLimits.ts and
 * frontend/src/constants/statBlockLimits.ts, and a test keeps the two copies
 * identical, so a form never allows what the server refuses.
 */
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
} as const;
