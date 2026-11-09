/**
 * rules/hitPoints.ts
 * Damage and healing on hit points that may carry temporary hit points.
 *
 * ---------------------------------------------------------------------------
 * DUPLICATED FILE — these two copies must stay byte-for-byte identical:
 *   frontend/src/utils/rules/hitPoints.ts
 *   backend/src/utils/rules/hitPoints.ts
 * ---------------------------------------------------------------------------
 * Same arrangement as rules/dnd5e.ts beside it: a parity test in the backend
 * suite compares the two files and fails on any difference. Edit one, copy it
 * to the other.
 *
 * The server applies it to a character's sheet (the roster's damage buttons),
 * the token editor to a creature's hit points, so a character and a creature
 * take damage the same way.
 *
 * Rules: in D&D 5e and Pathfinder 2e damage takes temporary hit points first,
 * and only what is left comes off current hit points; healing restores current
 * hit points only, never temporary ones. Temporary hit points never add
 * together: a creature that already has some and is granted more keeps the
 * ones it has or takes the new ones. Call of Cthulhu's rules give a temporary
 * hit point only to a dying investigator stabilised with First Aid, which the
 * sheet does not track, so its sheet keeps no pool a grant could add to.
 */

export interface HitPoints {
  current: number;
  max: number;
  temp: number;
}

/**
 * `hp` after a change of `delta`: negative is damage, positive healing.
 * Current hit points stay between 0 and the maximum; temporary hit points
 * fall to 0 once spent.
 */
export function applyHitPointChange(hp: HitPoints, delta: number): HitPoints {
  const temp = Math.max(0, hp.temp);
  const absorbed = delta < 0 ? Math.min(temp, -delta) : 0;
  return {
    current: Math.max(0, Math.min(hp.max, hp.current + delta + absorbed)),
    max: hp.max,
    temp: temp - absorbed,
  };
}

/** The most temporary hit points a grant may give, as a token's hit points are bounded. */
export const MAX_TEMPORARY_HIT_POINTS = 99_999;

/** The game systems whose sheets keep a pool of temporary hit points a grant can add to. */
const SYSTEMS_WITH_TEMPORARY_HIT_POINTS: readonly string[] = ['DND_5E', 'PATHFINDER_2E'];

/** What a creature may end with when granted temporary hit points. */
export interface TemporaryHitPointGrant {
  /** The ones it has, when it has some and keeping them differs from taking the new ones; else null. */
  keep: number | null;
  /** The new ones, which replace any it has. */
  take: number;
}

/**
 * Temporary hit points `granted` to a creature that has `current`, by the
 * rules of `system`: never added together, so the creature ends with either
 * amount, whichever is chosen, and with the new one when it has none. Null in
 * a system whose sheet keeps no temporary hit points.
 */
export function grantTemporaryHitPoints(current: number, granted: number, system: string | null | undefined): TemporaryHitPointGrant | null {
  if (!system || !SYSTEMS_WITH_TEMPORARY_HIT_POINTS.includes(system)) return null;
  const held = Math.max(0, current);
  return { keep: held > 0 && held !== granted ? held : null, take: granted };
}
