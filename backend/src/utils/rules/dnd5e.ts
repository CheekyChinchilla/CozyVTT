/**
 * rules/dnd5e.ts
 * D&D 5e rules maths: ability modifiers, proficiency bonus, the skill list,
 * and the inference used to read proficiency back out of a printed bonus.
 *
 * ---------------------------------------------------------------------------
 * DUPLICATED FILE — these two copies must stay byte-for-byte identical:
 *   frontend/src/utils/rules/dnd5e.ts
 *   backend/src/utils/rules/dnd5e.ts
 * ---------------------------------------------------------------------------
 * The frontend and backend are separate TypeScript projects with no shared
 * package, and the repo already hand-syncs types across the boundary (see
 * docs/GAME_SYSTEMS.md). A parity test in each project compares the two files
 * and fails on any difference, so drift breaks CI rather than silently changing
 * dice maths on one side only. Edit one, copy it to the other.
 *
 * Rules references: SRD 5.1 "Monsters" (proficiency bonus by challenge rating)
 * and the Basic Rules "Using Ability Scores" (modifier derivation). Both are
 * mirrored in system-docs/Dungeons and Dragons/.
 */

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

/** The six ability keys, in the canonical stat-block order. */
export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export type AbilityKey = (typeof ABILITY_KEYS)[number];

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

/**
 * Ability modifier: floor((score - 10) / 2).
 *
 * Handles odd and sub-10 scores the way the rules do — a score of 7 is -2, not
 * -1.5 truncated toward zero, which is why this uses floor rather than trunc.
 */
export function abilityModifier(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.floor((score - 10) / 2);
}

/** Render a modifier the way a stat block does: "+3", "0", "-1". */
export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// ---------------------------------------------------------------------------
// Proficiency bonus
// ---------------------------------------------------------------------------

/**
 * Proficiency bonus bands. A monster's proficiency bonus is taken from its
 * challenge rating on exactly the same curve a character's is taken from level,
 * so a CR 7 monster and a 7th-level character both get +3.
 *
 * CR 0, 1/8, 1/4 and 1/2 all fall in the first band.
 */
export const PROFICIENCY_BANDS: ReadonlyArray<{ maxCr: number; bonus: number }> = [
  { maxCr: 4, bonus: 2 },
  { maxCr: 8, bonus: 3 },
  { maxCr: 12, bonus: 4 },
  { maxCr: 16, bonus: 5 },
  { maxCr: 20, bonus: 6 },
  { maxCr: 24, bonus: 7 },
  { maxCr: 28, bonus: 8 },
  { maxCr: 30, bonus: 9 },
];

/** Lowest proficiency bonus in the game — the fallback when CR is unknown. */
export const MIN_PROFICIENCY_BONUS = 2;

/** Highest proficiency bonus in the game (CR 29-30). */
export const MAX_PROFICIENCY_BONUS = 9;

/**
 * Parse a challenge rating as written in a stat block into a number.
 *
 * Accepts "0", "1/8", "1/4", "1/2", "5", "21", and tolerates surrounding
 * whitespace. Returns null for anything unparseable (including "—", which some
 * sources use for creatures without a CR) so callers can decide the fallback.
 */
export function parseChallengeRating(cr: string | number | null | undefined): number | null {
  if (typeof cr === 'number') return Number.isFinite(cr) ? cr : null;
  if (!cr) return null;

  const trimmed = String(cr).trim();
  if (!trimmed) return null;

  const fraction = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return Number(fraction[1]) / denominator;
  }

  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Proficiency bonus for a monster of the given challenge rating.
 *
 * Unknown or unparseable CRs fall back to +2 rather than throwing: a stat block
 * with no CR is common (homebrew, imported NPCs) and the lowest bonus is the
 * least surprising default.
 */
export function proficiencyBonusForCR(cr: string | number | null | undefined): number {
  const parsed = parseChallengeRating(cr);
  if (parsed === null) return MIN_PROFICIENCY_BONUS;

  for (const band of PROFICIENCY_BANDS) {
    if (parsed <= band.maxCr) return band.bonus;
  }
  return MAX_PROFICIENCY_BONUS;
}

/**
 * Proficiency bonus for a character of the given level. Shares the CR curve —
 * kept here so the relationship is visible in one place rather than implied.
 */
export function proficiencyBonusForLevel(level: number): number {
  if (!Number.isFinite(level) || level < 1) return MIN_PROFICIENCY_BONUS;
  return proficiencyBonusForCR(Math.min(level, 30));
}

/**
 * Every challenge rating a 5e creature can have, in order.
 *
 * Offered as a fixed list rather than free text so a typo cannot silently
 * change a creature's proficiency bonus — "1/3" or "one" would fall back to +2
 * with no indication anything was wrong.
 */
export const CHALLENGE_RATINGS: readonly string[] = [
  '0',
  '1/8',
  '1/4',
  '1/2',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
];

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export interface SkillDefinition {
  /** Canonical camelCase key, matching the player-character sheet's DnD5eSkills. */
  key: string;
  /** Display name as printed in a stat block. */
  label: string;
  /** The ability a check with this skill uses. */
  ability: AbilityKey;
}

/** The eighteen 5e skills, in the alphabetical order stat blocks print them. */
export const DND5E_SKILLS: readonly SkillDefinition[] = [
  { key: 'acrobatics', label: 'Acrobatics', ability: 'dex' },
  { key: 'animalHandling', label: 'Animal Handling', ability: 'wis' },
  { key: 'arcana', label: 'Arcana', ability: 'int' },
  { key: 'athletics', label: 'Athletics', ability: 'str' },
  { key: 'deception', label: 'Deception', ability: 'cha' },
  { key: 'history', label: 'History', ability: 'int' },
  { key: 'insight', label: 'Insight', ability: 'wis' },
  { key: 'intimidation', label: 'Intimidation', ability: 'cha' },
  { key: 'investigation', label: 'Investigation', ability: 'int' },
  { key: 'medicine', label: 'Medicine', ability: 'wis' },
  { key: 'nature', label: 'Nature', ability: 'int' },
  { key: 'perception', label: 'Perception', ability: 'wis' },
  { key: 'performance', label: 'Performance', ability: 'cha' },
  { key: 'persuasion', label: 'Persuasion', ability: 'cha' },
  { key: 'religion', label: 'Religion', ability: 'int' },
  { key: 'sleightOfHand', label: 'Sleight of Hand', ability: 'dex' },
  { key: 'stealth', label: 'Stealth', ability: 'dex' },
  { key: 'survival', label: 'Survival', ability: 'wis' },
];

const SKILL_BY_NORMALIZED = new Map<string, SkillDefinition>();
for (const skill of DND5E_SKILLS) {
  // Index by a punctuation-free, lowercase form so every spelling collapses to
  // one entry: "animalHandling", "animal_handling", "Animal Handling",
  // "animal-handling" all reduce to "animalhandling".
  SKILL_BY_NORMALIZED.set(skill.key.toLowerCase(), skill);
  SKILL_BY_NORMALIZED.set(skill.label.toLowerCase().replace(/[^a-z]/g, ''), skill);
}

/**
 * Resolve any spelling of a skill name to its canonical definition.
 *
 * This matters for real data, not just tidiness: the SRD importer stores
 * Open5e's snake_case keys ("animal_handling", "sleight_of_hand"), which never
 * matched the camelCase lookup the roll picker used, so those skills lost their
 * ability association. Returns null for unrecognised names, which are kept as
 * free-form custom skills rather than silently discarded.
 */
export function findSkill(name: string): SkillDefinition | null {
  if (!name) return null;
  const normalized = name.toLowerCase().replace(/[^a-z]/g, '');
  return SKILL_BY_NORMALIZED.get(normalized) ?? null;
}

/** Canonical key for a skill name, or the trimmed input if unrecognised. */
export function normalizeSkillKey(name: string): string {
  return findSkill(name)?.key ?? name.trim();
}

/** Display label for a skill key, falling back to the raw key. */
export function skillLabel(key: string): string {
  return findSkill(key)?.label ?? key;
}

// ---------------------------------------------------------------------------
// Proficiency levels
// ---------------------------------------------------------------------------

/**
 * How proficient a creature is in a save or skill.
 *
 * 'custom' means the bonus was set explicitly and is not derived — used for
 * homebrew and for published creatures whose printed value does not decompose
 * into ability modifier plus a whole number of proficiency bonuses.
 */
export type ProficiencyLevel = 'none' | 'proficient' | 'expertise' | 'custom';

/** Multiplier applied to the proficiency bonus for each derived level. */
const PROFICIENCY_MULTIPLIER: Record<Exclude<ProficiencyLevel, 'custom'>, number> = {
  none: 0,
  proficient: 1,
  expertise: 2,
};

/**
 * The bonus a creature has in a save or skill.
 *
 * Expertise doubles the proficiency bonus, matching the player rule. Monsters
 * do get expertise — it is simply not labelled in printed stat blocks, so a
 * Goblin's Stealth +6 (Dex +2, PB +2) is doubled proficiency.
 */
export function derivedBonus(
  abilityMod: number,
  proficiencyBonus: number,
  level: Exclude<ProficiencyLevel, 'custom'>
): number {
  return abilityMod + proficiencyBonus * PROFICIENCY_MULTIPLIER[level];
}

/**
 * Work backwards from a printed bonus to the proficiency level that produces it.
 *
 * Used to read existing stat blocks — including every seeded SRD creature,
 * which stores only final totals — so the editor can show the right checkboxes
 * without changing any number. Anything that does not decompose cleanly is
 * reported as 'custom' and kept verbatim rather than "corrected".
 */
export function decomposeBonus(
  total: number,
  abilityMod: number,
  proficiencyBonus: number
): ProficiencyLevel {
  if (total === abilityMod) return 'none';
  if (total === abilityMod + proficiencyBonus) return 'proficient';
  if (total === abilityMod + proficiencyBonus * 2) return 'expertise';
  return 'custom';
}

// ---------------------------------------------------------------------------
// Passive scores
// ---------------------------------------------------------------------------

/**
 * The base a passive score is measured from: the character takes 10 rather than
 * rolling, so a passive check is 10 plus the check's total modifier.
 */
export const PASSIVE_BASE = 10;

/**
 * Passive score for a check with the given total bonus.
 *
 * The bonus passed in must already be the *complete* modifier for the check —
 * ability modifier plus proficiency, doubled for expertise. That is the whole
 * point of taking it as an argument: passive Perception was previously stored
 * as its own number, computed separately from the Perception bonus, so the two
 * could and did disagree. A character with expertise in Perception showed the
 * right +5 on the skill and a passive score that had only counted proficiency
 * once. Derive the bonus once, then pass it here.
 *
 * Advantage on the check adds 5 and disadvantage subtracts 5 (Basic Rules,
 * "Passive Checks"). Those are situational rather than properties of the sheet,
 * so they are not applied here.
 */
export function passiveScore(totalBonus: number): number {
  if (!Number.isFinite(totalBonus)) return PASSIVE_BASE;
  return PASSIVE_BASE + totalBonus;
}

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

/**
 * Bounds for a manually overridden save or skill bonus.
 *
 * The widest legitimate 5e value is roughly ability +10 with expertise at +9
 * proficiency (=+28) for a CR 30 creature, so ±30 admits every real stat block
 * while still rejecting the unbounded input that let "+30" be typed for a
 * commoner. This is a sanity bound, not a rules bound — deliberately generous
 * so homebrew is not blocked.
 */
export const MIN_BONUS_OVERRIDE = -30;
export const MAX_BONUS_OVERRIDE = 30;

/** Bounds for an ability score, matching the existing stat-block validation. */
export const MIN_ABILITY_SCORE = 0;
export const MAX_ABILITY_SCORE = 30;

// ---------------------------------------------------------------------------
// Spellcasting
// ---------------------------------------------------------------------------

/**
 * The ability a sheet names for its spellcasting, as a `stats` key.
 *
 * The field is free text — "Intelligence", "int", "INT" have all been typed
 * into it — so it is matched loosely. Returns null when it names nothing
 * recognisable, which includes the common case of a non-caster leaving it
 * empty.
 */
export function spellcastingAbilityKey(ability: unknown): string | null {
  if (typeof ability !== 'string') return null;
  const wanted = ability.trim().toLowerCase();
  if (!wanted) return null;
  const full = [
    'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
  ];
  const match = full.find((name) => name === wanted || name.startsWith(wanted));
  return match ?? null;
}

/**
 * The spellcasting ability modifier a 5e sheet implies, or 0 when it names no
 * ability. Recomputed from the score, so a stored modifier that has fallen out
 * of step cannot skew the results below.
 */
export function spellcastingAbilityModifier(data: unknown): number {
  const sheet = data as Record<string, unknown> | null | undefined;
  const spellcasting = sheet?.spellcasting as Record<string, unknown> | undefined;
  const key = spellcastingAbilityKey(spellcasting?.ability);
  if (!key) return 0;

  const stats = sheet?.stats as Record<string, unknown> | undefined;
  const entry = stats?.[key] as Record<string, unknown> | undefined;
  if (!entry) return 0;
  return typeof entry.score === 'number'
    ? abilityModifier(entry.score)
    : (typeof entry.modifier === 'number' ? entry.modifier : 0);
}

/** The proficiency bonus a sheet records, falling back to the level-1 value. */
export function sheetProficiencyBonus(data: unknown): number {
  const sheet = data as Record<string, unknown> | null | undefined;
  const stored = sheet?.proficiencyBonus;
  if (typeof stored === 'number' && Number.isFinite(stored)) return stored;
  const level = sheet?.level;
  return proficiencyBonusForLevel(typeof level === 'number' ? level : 1);
}

/** A manual adjustment off the sheet, 0 when absent or unusable. */
function otherBonus(data: unknown, field: string): number {
  const sheet = data as Record<string, unknown> | null | undefined;
  const spellcasting = sheet?.spellcasting as Record<string, unknown> | undefined;
  const value = spellcasting?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Spell save DC.
 *
 * Basic Rules, "Spellcasting Ability": `8 + proficiency bonus + spellcasting
 * ability modifier`. `spellSaveDCOtherBonus` is added on top for the things
 * that adjust it without changing either input — a Rod of the Pact Keeper or a
 * Robe of the Archmagi — in the same way the sheet already handles initiative
 * and passive Perception.
 */
export function dnd5eSpellSaveDC(data: unknown): number {
  return (
    SPELL_SAVE_DC_BASE +
    sheetProficiencyBonus(data) +
    spellcastingAbilityModifier(data) +
    otherBonus(data, 'spellSaveDCOtherBonus')
  );
}

/**
 * Spell attack bonus.
 *
 * Basic Rules: `proficiency bonus + spellcasting ability modifier`. Kept
 * separate from the save DC because items exist that raise one and not the
 * other — a Wand of the War Mage adds to attack rolls alone.
 */
export function dnd5eSpellAttackBonus(data: unknown): number {
  return (
    sheetProficiencyBonus(data) +
    spellcastingAbilityModifier(data) +
    otherBonus(data, 'spellAttackOtherBonus')
  );
}

/** The 8 every spell save DC starts from. */
export const SPELL_SAVE_DC_BASE = 8;

/**
 * The manual adjustment implied by a sheet saved before these were derived, so
 * a caster's numbers do not change under them.
 *
 * Both used to be hand-typed. A wizard with a Rod of the Pact Keeper typed
 * DC 16 where the formula gives 15; deriving without reading that back would
 * quietly take the point away. So the stored total is read as "formula plus the
 * rest", which is what it always meant.
 *
 * Returns null when there is nothing to convert, so a caller can leave the
 * sheet alone. That covers three cases:
 *
 *   - the adjustment field already exists, so the split has been made;
 *   - the stored value is the one the blank templates ship (DC 8, attack +0),
 *     which means nobody ever filled it in — converting that would hand a
 *     non-caster a large negative adjustment;
 *   - the sheet names no spellcasting ability, so the stored number describes
 *     nothing and is not worth preserving.
 */
export function dnd5eBackfilledSpellSaveDCBonus(data: unknown): number | null {
  const sheet = data as Record<string, unknown> | null | undefined;
  const spellcasting = sheet?.spellcasting as Record<string, unknown> | undefined;
  if (!spellcasting) return null;
  if (spellcasting.spellSaveDCOtherBonus !== undefined && spellcasting.spellSaveDCOtherBonus !== null) {
    return null;
  }
  const stored = spellcasting.spellSaveDC;
  if (typeof stored !== 'number' || !Number.isFinite(stored)) return null;
  if (stored === SPELL_SAVE_DC_BASE) return null;
  if (!spellcastingAbilityKey(spellcasting.ability)) return null;

  const derived =
    SPELL_SAVE_DC_BASE + sheetProficiencyBonus(sheet) + spellcastingAbilityModifier(sheet);
  return stored - derived;
}

/** As above, for the spell attack bonus. A stored +0 means it was never set. */
export function dnd5eBackfilledSpellAttackBonus(data: unknown): number | null {
  const sheet = data as Record<string, unknown> | null | undefined;
  const spellcasting = sheet?.spellcasting as Record<string, unknown> | undefined;
  if (!spellcasting) return null;
  if (spellcasting.spellAttackOtherBonus !== undefined && spellcasting.spellAttackOtherBonus !== null) {
    return null;
  }
  const stored = spellcasting.spellAttackBonus;
  if (typeof stored !== 'number' || !Number.isFinite(stored)) return null;
  if (stored === 0) return null;
  if (!spellcastingAbilityKey(spellcasting.ability)) return null;

  const derived = sheetProficiencyBonus(sheet) + spellcastingAbilityModifier(sheet);
  return stored - derived;
}

/**
 * Whether a sheet describes a character who actually casts spells.
 *
 * The `spellcasting` object is present on every sheet, a barbarian's included,
 * so testing it for truth showed a spellcasting panel to everyone — and since
 * the templates seeded class "Wizard", a Fighter's sheet announced "Wizard
 * Spellcasting". What settles it is whether anything has been filled in: an
 * ability named, or a cantrip, prepared spell or slot recorded.
 */
export function hasSpellcasting(data: unknown): boolean {
  const sheet = data as Record<string, unknown> | null | undefined;
  const spellcasting = sheet?.spellcasting as Record<string, unknown> | undefined;
  if (!spellcasting) return false;

  if (spellcastingAbilityKey(spellcasting.ability)) return true;
  if (Array.isArray(spellcasting.cantrips) && spellcasting.cantrips.length > 0) return true;
  if (Array.isArray(spellcasting.spells) && spellcasting.spells.length > 0) return true;

  const slots = spellcasting.slots as Record<string, unknown> | undefined;
  if (slots) {
    for (const slot of Object.values(slots)) {
      const entry = slot as Record<string, unknown> | undefined;
      if (entry && typeof entry.total === 'number' && entry.total > 0) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Exhaustion
// ---------------------------------------------------------------------------

/**
 * The six levels of exhaustion and what each one does.
 *
 * Basic Rules, Appendix A: "Exhaustion is measured in six levels... A creature
 * suffers the effect of its current level of exhaustion as well as all lower
 * levels." Level 6 is death.
 *
 * The sheet used to offer exhaustion as a single checkbox alongside the other
 * fourteen conditions, which cannot record which level a character is on — the
 * difference between disadvantage on ability checks and being dead.
 */
export const EXHAUSTION_EFFECTS: readonly string[] = [
  'Disadvantage on ability checks',
  'Speed halved',
  'Disadvantage on attack rolls and saving throws',
  'Hit point maximum halved',
  'Speed reduced to 0',
  'Death',
];

/** Levels run 0 (none) to 6 (death). */
export const MAX_EXHAUSTION_LEVEL = 6;

/** A stored exhaustion level, clamped to the range the rules define. */
export function exhaustionLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(MAX_EXHAUSTION_LEVEL, Math.max(0, Math.trunc(value)));
}

/**
 * Every effect in force at a given level, lowest first.
 *
 * Effects are cumulative, so level 3 carries levels 1 and 2 as well.
 */
export function exhaustionEffects(level: unknown): string[] {
  return EXHAUSTION_EFFECTS.slice(0, exhaustionLevel(level));
}

// ---------------------------------------------------------------------------
// Skills of the player's own
// ---------------------------------------------------------------------------

/** The six abilities, spelled as a character sheet's `stats` keys. */
export const DND5E_ABILITY_NAMES = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

export type Dnd5eAbilityName = (typeof DND5E_ABILITY_NAMES)[number];

/**
 * A check the eighteen skills do not cover.
 *
 * Tool proficiencies are the reason this exists: "proficiency with a tool
 * allows you to add your proficiency bonus to any ability check you make using
 * that tool" (Basic Rules p. 51), which is the same arithmetic as a skill but
 * has nowhere on the sheet to live. A player wanting to roll Thieves' Tools had
 * to either work it out by hand or record it as a weapon, which put a lockpick
 * on the combat tab and gave it an attack roll it does not have.
 */
export interface Dnd5eCustomSkill {
  name: string;
  ability: Dnd5eAbilityName;
  proficient: boolean;
  expertise: boolean;
  /** Anything the maths cannot know about — a magic item, a feat. */
  otherBonus?: number;
}

/** The modifier a sheet's named ability has, recomputed from its score. */
export function sheetAbilityModifier(data: unknown, ability: string): number {
  const sheet = data as Record<string, unknown> | null | undefined;
  const stats = sheet?.stats as Record<string, unknown> | undefined;
  const entry = stats?.[ability] as Record<string, unknown> | undefined;
  if (!entry) return 0;
  // Score first: a stored modifier that has fallen out of step with the score
  // would otherwise quietly skew every check made with it.
  return typeof entry.score === 'number'
    ? abilityModifier(entry.score)
    : (typeof entry.modifier === 'number' ? entry.modifier : 0);
}

/**
 * The total bonus for one of the player's own skills.
 *
 * Derived rather than stored, like initiative and passive Perception: ability
 * modifier, plus the proficiency bonus doubled for expertise, plus whatever the
 * sheet cannot work out for itself. Nothing here is specific to tools — the
 * same arithmetic covers a homebrew skill or a subsystem a table invented.
 */
export function dnd5eCustomSkillBonus(data: unknown, skill: Dnd5eCustomSkill): number {
  const abilityMod = sheetAbilityModifier(data, skill.ability);
  const proficiency = sheetProficiencyBonus(data);
  const level = skill.expertise ? 'expertise' : skill.proficient ? 'proficient' : 'none';
  const extra =
    typeof skill.otherBonus === 'number' && Number.isFinite(skill.otherBonus)
      ? skill.otherBonus
      : 0;
  return derivedBonus(abilityMod, proficiency, level) + extra;
}

/**
 * Read the custom skills off a sheet, dropping anything unusable.
 *
 * A row exists from the moment it is added and is named afterwards, so a
 * nameless one is a half-finished edit rather than a skill; an unrecognised
 * ability would silently roll off Strength, so those go too.
 */
export function readCustomSkills(data: unknown): Dnd5eCustomSkill[] {
  const sheet = data as Record<string, unknown> | null | undefined;
  const raw = sheet?.customSkills;
  if (!Array.isArray(raw)) return [];

  const abilities = new Set<string>(DND5E_ABILITY_NAMES);
  const skills: Dnd5eCustomSkill[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const ability = typeof row.ability === 'string' ? row.ability : '';
    if (!name || !abilities.has(ability)) continue;

    skills.push({
      name,
      ability: ability as Dnd5eAbilityName,
      proficient: row.proficient === true,
      expertise: row.expertise === true,
      ...(typeof row.otherBonus === 'number' && Number.isFinite(row.otherBonus)
        ? { otherBonus: row.otherBonus }
        : {}),
    });
  }

  return skills;
}
