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
 * hit points only, never temporary ones.
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
