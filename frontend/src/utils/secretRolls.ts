/**
 * Who may see a dice roll in the roll list.
 *
 * **This is not the security boundary.** The server is, in two places that
 * already agree: the socket handler sends a secret roll only to the person who
 * made it and to the campaign's DMs, and `GET /campaigns/:id/dice-rolls`
 * filters history with `isDM ? {} : { OR: [{ secret: false }, { secret: true,
 * userId }] }`. Nothing else is ever sent over the wire.
 *
 * This is the second line of defence, and the reason it exists is that a
 * display bug would be indistinguishable from a leak: if someone else's secret
 * roll ever did arrive — a future refactor, a mis-scoped broadcast — the panel
 * must not put it on screen. Cheap to check, and it fails closed.
 */

/** The parts of a roll this decision depends on. */
export interface RollVisibility {
  userId: string;
  secret?: boolean;
}

/**
 * Whether the panel may display a roll at all.
 *
 * A public roll: everyone. A secret roll: the person who rolled it, and the DM,
 * who receives them deliberately for audit and dispute resolution.
 */
export function mayDisplayRoll(
  roll: RollVisibility,
  viewerId: string | undefined,
  isDM: boolean
): boolean {
  if (!roll.secret) return true;
  if (isDM) return true;
  return !!viewerId && roll.userId === viewerId;
}

/**
 * Apply the viewer's own "show secret rolls" preference on top.
 *
 * Purely a view filter over rolls this viewer is already entitled to — someone
 * who turns it off is tidying their own panel, not changing what anyone else
 * can see. Kept separate from `mayDisplayRoll` so the two cannot be confused:
 * one is a permission, the other is a preference.
 */
export function visibleRolls<T extends RollVisibility>(
  rolls: readonly T[],
  viewerId: string | undefined,
  isDM: boolean,
  showSecret: boolean
): T[] {
  return rolls.filter(
    (roll) => mayDisplayRoll(roll, viewerId, isDM) && (showSecret || !roll.secret)
  );
}
