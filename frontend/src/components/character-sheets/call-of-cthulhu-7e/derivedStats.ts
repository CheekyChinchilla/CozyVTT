/**
 * The Call of Cthulhu 7e derived attributes, worked out from the
 * characteristics as the core rulebook's investigator creation steps say.
 *
 * Kept apart from the editor so they can be tested on their own. Dodge's base
 * is in dodge.ts.
 */

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

/** Damage bonus and build, from STR plus SIZ (the rulebook's Table I). */
export function cocDamageBonusAndBuild(str: number, siz: number): { damageBonus: string; build: number } {
  // TODO(rules): above 524 the table goes on, adding 1D6 and 1 build for each
  // further 80 points; this stops at +5D6 and build 6. No investigator reaches
  // it (each characteristic stops at 99), but a creature entered on the sheet
  // could. Extend the steps past 524.
  const total = str + siz;
  if (total <= 64) return { damageBonus: '-2', build: -2 };
  if (total <= 84) return { damageBonus: '-1', build: -1 };
  if (total <= 124) return { damageBonus: '0', build: 0 };
  if (total <= 164) return { damageBonus: '+1d4', build: 1 };
  if (total <= 204) return { damageBonus: '+1d6', build: 2 };
  if (total <= 284) return { damageBonus: '+2d6', build: 3 };
  if (total <= 364) return { damageBonus: '+3d6', build: 4 };
  if (total <= 444) return { damageBonus: '+4d6', build: 5 };
  return { damageBonus: '+5d6', build: 6 };
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
