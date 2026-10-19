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

/**
 * Each skill's base on a fresh investigator, from the Keeper Rulebook's skill
 * list ("Accounting (05%)" and so on). Dodge (half DEX) and Language (Own)
 * (EDU) are worked out from the characteristics; the specialised skills each
 * start empty, with a base of their own per specialisation.
 */
export const COC_SKILL_BASES = {
  accounting: 5, anthropology: 1, appraise: 5, archaeology: 1, artCraft: 5, charm: 15, climb: 20,
  creditRating: 0, cthulhuMythos: 0, disguise: 5, driveAuto: 20, electricalRepair: 10, fastTalk: 5,
  firstAid: 30, history: 5, intimidate: 15, jump: 20, law: 5, libraryUse: 20, listen: 20, locksmith: 1,
  mechanicalRepair: 10, medicine: 1, naturalWorld: 10, navigate: 10, occult: 5, operateHeavyMachinery: 1,
  persuade: 10, pilot: 1, psychoanalysis: 1, psychology: 10, ride: 5, sleightOfHand: 10, spotHidden: 25,
  stealth: 20, survival: 10, swim: 20, throw: 20, track: 10,
} as const;

/** A skill at its base, not yet improved. */
function freshSkill(base: number): { baseValue: number; currentValue: number; improvementChecked: boolean } {
  return { baseValue: base, currentValue: base, improvementChecked: false };
}

/**
 * A fresh investigator's skills block: every skill at its base, with Dodge at
 * half DEX, the own language at EDU, Brawl at 25, Handgun at 20 and Rifle and
 * Shotgun at 25.
 */
export function cocBlankSkills(dex: number, edu: number): Record<string, unknown> {
  const skills: Record<string, unknown> = {};
  for (const [key, base] of Object.entries(COC_SKILL_BASES)) skills[key] = freshSkill(base);
  for (const key of ['artCraft', 'pilot', 'survival']) skills[key] = { ...freshSkill(COC_SKILL_BASES[key as 'pilot']), specialization: null };
  skills.dodge = freshSkill(cocDodgeBase(dex));
  skills.languageOwn = { ...freshSkill(Number.isFinite(edu) ? edu : 0), language: 'English' };
  skills.fighting = { brawl: freshSkill(25), custom: [] };
  skills.firearms = { handgun: freshSkill(20), rifle: freshSkill(25), shotgun: freshSkill(25), custom: [] };
  skills.languageOther = [];
  skills.science = [];
  skills.customSkills = [];
  return skills;
}

/**
 * A weapon's damage with the damage bonus written in. The sheet writes it as
 * DB ("1d3+DB" for a punch), which the dice cannot read: a bonus of 0 drops
 * it, a negative one is subtracted, and a die is added. "Damage bonus is not
 * applied to firearms", so a gun's damage has no DB to replace.
 *
 * A thrown weapon or a bow adds half the bonus ("1D3+half DB"). Half of none
 * is none and is dropped; the rules give no way to halve a bonus in dice, so
 * any other half bonus is left as written.
 */
export function cocDamageWithBonus(damage: string, damageBonus: string): string {
  const bonus = damageBonus.trim();
  const none = bonus === '' || bonus === '0';
  const written = none ? '' : bonus.startsWith('-') || bonus.startsWith('+') ? bonus : `+${bonus}`;
  const full = damage.replace(/\s*\+\s*DB\b/gi, written);
  return none ? full.replace(/\s*\+\s*(?:half|½|1\/2)\s*DB\b/gi, '') : full;
}

/**
 * The value of the skill a weapon names, from the sheet's skills: "Brawl" or
 * "Fighting (Brawl)", "Handgun" or "Firearms (Handgun)", a specialisation the
 * player added ("Sword"), or any other skill by its key ("Throw"). The weapon
 * keeps a copy of the value, which goes stale as the skill rises; that copy
 * is used only where the sheet has no such skill.
 */
export function cocWeaponSkillValue(skills: unknown, skillName: string, stored: number): number {
  const all = (skills && typeof skills === 'object' ? skills : {}) as Record<string, unknown>;
  const valueOf = (entry: unknown): number | null => {
    const value = (entry as { currentValue?: unknown } | undefined)?.currentValue;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  const name = skillName.trim().toLowerCase();
  if (!name) return stored;
  const inner = /^(fighting|firearms)\s*\((.+)\)$/.exec(name);
  const wanted = inner ? inner[2].trim() : name;
  for (const group of ['fighting', 'firearms']) {
    const members = (all[group] && typeof all[group] === 'object' ? all[group] : {}) as Record<string, unknown>;
    const printed = wanted === 'rifle/shotgun' ? 'rifle' : wanted;
    const direct = valueOf(members[printed]);
    if (direct !== null && printed !== 'custom') return direct;
    const custom = Array.isArray(members.custom) ? members.custom : [];
    const match = custom.find((entry) => String((entry as { specialization?: unknown }).specialization ?? '').trim().toLowerCase() === wanted);
    if (match !== undefined && valueOf(match) !== null) return valueOf(match) as number;
  }
  const key = Object.keys(all).find((candidate) => candidate.toLowerCase() === wanted.replace(/\s+/g, ''));
  const plain = key ? valueOf(all[key]) : null;
  return plain ?? stored;
}

/**
 * An investigator's derived attributes, worked out from the sheet's
 * characteristics, age and Cthulhu Mythos as the editor works them out, so a
 * sheet the editor has not saved since shows what its parts give.
 */
export function cocDerivedAttributes(data: unknown): {
  hitPoints: number;
  majorWoundThreshold: number;
  magicPoints: number;
  maxSanity: number;
  damageBonus: string;
  build: number;
  moveRate: number;
} {
  const sheet = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const characteristics = (sheet.characteristics && typeof sheet.characteristics === 'object' ? sheet.characteristics : {}) as Record<string, unknown>;
  const c = (key: string): number => {
    const value = (characteristics[key] as { regular?: unknown } | undefined)?.regular;
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };
  const skills = (sheet.skills && typeof sheet.skills === 'object' ? sheet.skills : {}) as Record<string, unknown>;
  const mythosSkill = (skills.cthulhuMythos as { currentValue?: unknown } | undefined)?.currentValue;
  const mythosBox = (sheet.spellsAndMythos as { cthulhuMythos?: unknown } | undefined)?.cthulhuMythos;
  const mythos = Math.max(typeof mythosSkill === 'number' ? mythosSkill : 0, typeof mythosBox === 'number' ? mythosBox : 0);
  const hitPoints = cocHitPoints(c('CON'), c('SIZ'));
  const { damageBonus, build } = cocDamageBonusAndBuild(c('STR'), c('SIZ'));
  return {
    hitPoints,
    majorWoundThreshold: cocMajorWoundThreshold(hitPoints),
    magicPoints: cocMagicPoints(c('POW')),
    maxSanity: cocMaxSanity(mythos),
    damageBonus,
    build,
    moveRate: cocMoveRate(c('STR'), c('DEX'), c('SIZ'), Number(sheet.age) || 30),
  };
}
