/**
 * rules/callOfCthulhu7e.ts
 * The Call of Cthulhu 7e derived attributes, worked out from the
 * characteristics as the core rulebook's investigator creation steps say.
 *
 * ---------------------------------------------------------------------------
 * DUPLICATED FILE — these two copies must stay byte-for-byte identical:
 *   frontend/src/utils/rules/callOfCthulhu7e.ts
 *   backend/src/utils/rules/callOfCthulhu7e.ts
 * ---------------------------------------------------------------------------
 * The sheets work these out, and the backend suite checks the built-in
 * templates against them, so a template cannot ship a number that does not
 * follow from its own characteristics. A parity test fails on any difference.
 */

/** Dodge's base for an investigator's DEX: half, rounded down ("Dodge (half DEX)"). */
export function cocDodgeBase(dex: number): number {
  return Number.isFinite(dex) ? Math.floor(dex / 2) : 0;
}

/** Hit points: CON plus SIZ, divided by ten, rounded down. */
export function cocHitPoints(con: number, siz: number): number {
  return Math.floor((con + siz) / 10);
}

/** Magic points: one fifth of POW, rounded down. */
export function cocMagicPoints(pow: number): number {
  return Math.floor(pow / 5);
}

/** Maximum sanity: 99 less the Cthulhu Mythos skill. */
export function cocMaxSanity(cthulhuMythos: number): number {
  return 99 - cthulhuMythos;
}

/** A characteristic's half and fifth columns, each rounded down. */
export function cocHalfAndFifth(regular: number): { half: number; fifth: number } {
  return { half: Math.floor(regular / 2), fifth: Math.floor(regular / 5) };
}

/**
 * Damage bonus and build, from STR plus SIZ (the rulebook's Table I). Past 524
 * the table goes on: "Add an additional 1D6 to Damage Bonus and +1 to Build
 * for each additional 80 points or fraction thereof". An investigator's STR
 * and SIZ stop at 100 each, so only a creature's reach it.
 */
export function cocDamageBonusAndBuild(str: number, siz: number): { damageBonus: string; build: number } {
  const total = str + siz;
  if (total <= 64) return { damageBonus: '-2', build: -2 };
  if (total <= 84) return { damageBonus: '-1', build: -1 };
  if (total <= 124) return { damageBonus: '0', build: 0 };
  if (total <= 164) return { damageBonus: '+1d4', build: 1 };
  if (total <= 204) return { damageBonus: '+1d6', build: 2 };
  if (total <= 284) return { damageBonus: '+2d6', build: 3 };
  if (total <= 364) return { damageBonus: '+3d6', build: 4 };
  if (total <= 444) return { damageBonus: '+4d6', build: 5 };
  if (total <= 524) return { damageBonus: '+5d6', build: 6 };
  const further = Math.ceil((total - 524) / 80);
  return { damageBonus: `+${5 + further}d6`, build: 6 + further };
}

/**
 * The damage that is a major wound: "equal to or greater than half of the
 * character's maximum hit points in a single attack". Damage is a whole
 * number, so half is rounded up, and the threshold is never below 1.
 */
export function cocMajorWoundThreshold(maxHitPoints: number): number {
  return Math.max(1, Math.ceil(maxHitPoints / 2));
}

/**
 * Move rate: 7 when STR and DEX are both below SIZ, 9 when both are above it,
 * 8 otherwise; one less for each decade of age from the 40s on, and never
 * below 1.
 */
export function cocMoveRate(str: number, dex: number, siz: number, age: number): number {
  let moveRate = 8;

  if (str < siz && dex < siz) {
    moveRate = 7;
  } else if (str > siz && dex > siz) {
    moveRate = 9;
  }

  if (age >= 40 && age <= 49) moveRate -= 1;
  if (age >= 50 && age <= 59) moveRate -= 2;
  if (age >= 60 && age <= 69) moveRate -= 3;
  if (age >= 70 && age <= 79) moveRate -= 4;
  if (age >= 80) moveRate -= 5;

  return Math.max(1, moveRate);
}
