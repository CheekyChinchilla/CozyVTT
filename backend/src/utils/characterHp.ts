/**
 * Character HP extraction utility
 * Extracts { current, max, temp } from character sheet data
 * in a game-system-aware way, since each system stores HP differently.
 *
 * Duplicated verbatim in `frontend/src/utils/` and `backend/src/utils/`, and
 * pinned byte-for-byte by a parity test. Both ends have to agree: the server
 * computes the campaign roster's HP and the live `character.hp.updated`
 * broadcast, while the client renders the roster cards and the HP bars drawn on
 * map tokens. A difference between the two would show one number on the sheet
 * and a different one on the map.
 */

export interface CharacterHpInfo {
  current: number;
  max: number;
  temp: number;
}

export function extractCharacterHp(
  gameSystem: string | null,
  data: Record<string, unknown> | null | undefined
): CharacterHpInfo | null {
  if (!data || !gameSystem) return null;

  switch (gameSystem) {
    case 'DND_5E':
    case 'PATHFINDER_2E':
    case 'FLEXIBLE':
      return readHp(record(data.hp), false);
    case 'CALL_OF_CTHULHU_7E':
      // Call of Cthulhu keeps hit points under derived stats, and has no
      // temporary hit points.
      return readHp(record(record(data.derivedStats)?.hp), true);
    default:
      return null;
  }
}

/**
 * Whether two readings describe the same hit points.
 *
 * Used to decide whether a sheet save is worth broadcasting: the roster and
 * every token HP bar re-render on that event, and most saves do not touch HP.
 */
export function sameCharacterHp(
  a: CharacterHpInfo | null,
  b: CharacterHpInfo | null
): boolean {
  if (a === null || b === null) return a === b;
  return a.current === b.current && a.max === b.max && a.temp === b.temp;
}

/** Narrow an unknown value to an indexable record, or null. */
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

/**
 * Read `{ maximum, current, temporary }` off an HP block.
 *
 * Returns null unless `maximum` is a positive number, which is what tells a
 * sheet that has HP from one that simply has the field present — an unfilled
 * sheet stores zero, and a bar drawn against a maximum of zero is meaningless.
 * `current` falls back to full, and temporary hit points to none.
 */
function readHp(hp: Record<string, unknown> | null, ignoreTemporary: boolean): CharacterHpInfo | null {
  if (!hp) return null;
  const max = hp.maximum;
  // `!(max > 0)` rather than `max <= 0`: the two differ on NaN, which fails
  // every comparison. Inverting the guard to `<= 0` would let NaN through and
  // return a bar with a NaN maximum.
  if (typeof max !== 'number' || !(max > 0)) return null;
  return {
    current: typeof hp.current === 'number' ? hp.current : max,
    max,
    temp: !ignoreTemporary && typeof hp.temporary === 'number' ? hp.temporary : 0,
  };
}
