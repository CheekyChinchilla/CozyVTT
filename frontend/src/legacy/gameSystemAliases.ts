/**
 * The values earlier versions stored and sent, and what each is called now.
 *
 * Version 1.7.0 renamed the game systems and the game master's role, and
 * its migration renamed every stored value. What comes from outside the
 * database can still hold an old value: a campaign archive or a character file an older version
 * exported, a script, or a browser tab opened before the upgrade. Each old
 * value is accepted for good and read as its new one. Answers only ever
 * carry the new values.
 *
 * This file is the same, byte for byte, in backend/src/legacy/ and
 * frontend/src/legacy/, and is the one place either package writes an old
 * value; backend/src/__tests__/keepInStep.test.ts fails when the two copies
 * differ.
 */

/** A game system, as it is stored and sent. */
export type GameSystemName = 'FIFTH_EDITION' | 'FANTASY_D20' | 'HORROR_D100';

/** Each game system's value before 1.7.0, and its value now. */
export const LEGACY_GAME_SYSTEMS: Readonly<Record<string, GameSystemName>> = Object.freeze({
  DND_5E: 'FIFTH_EDITION',
  PATHFINDER_2E: 'FANTASY_D20',
  CALL_OF_CTHULHU_7E: 'HORROR_D100',
});

/**
 * The game master's value before 1.7.0: in a campaign role, a chat message's
 * type, a drawing's audience, and the share a campaign archive gives a
 * drawing. Each is GM now.
 */
export const LEGACY_GM = 'DM';

/**
 * A game system given by its old value or its new one, as its new one. Null,
 * no system, stays null. Anything else is not a game system and comes back
 * undefined, for the caller to refuse; `normaliseGameSystem(value) ?? value`
 * keeps it as given instead, for a check that refuses it later.
 */
export function normaliseGameSystem(value: unknown): GameSystemName | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const current = Object.values(LEGACY_GAME_SYSTEMS).find((name) => name === value);
  if (current !== undefined) return current;
  return Object.prototype.hasOwnProperty.call(LEGACY_GAME_SYSTEMS, value) ? LEGACY_GAME_SYSTEMS[value] : undefined;
}

/** The game master's old value as GM, and anything else as given, for the caller to check. */
function normaliseGm(value: unknown): unknown {
  return value === LEGACY_GM ? 'GM' : value;
}

/** A campaign role given by its old value or its new one. */
export const normaliseRole = normaliseGm;

/** A chat message's type given by its old value or its new one. */
export const normaliseMessageType = normaliseGm;

/** A drawing's audience given by its old value or its new one. */
export const normaliseDrawingAudience = normaliseGm;

/** The share a campaign archive names for a drawing, by its old value or its new one. */
export const normaliseDrawingShare = normaliseGm;
