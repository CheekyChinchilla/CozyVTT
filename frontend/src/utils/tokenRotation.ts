/**
 * Which way a token faces, in degrees clockwise from the top of its picture.
 *
 * The server stores any number from 0 to 360; the app writes whole degrees
 * from 0 to 359, so a full turn reads as facing up again.
 */

/** One press of Rotate Left or Rotate Right on the map's token menu. */
export const ROTATION_STEP = 45;

/** A stored rotation as whole degrees from 0 to 359; anything unreadable faces up. */
export function facing(degrees: number | null | undefined): number {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) return 0;
  return ((Math.round(degrees) % 360) + 360) % 360;
}

/** The rotation after turning by `step` degrees (negative turns left). */
export function turned(current: number | null | undefined, step: number): number {
  return facing(facing(current) + step);
}
