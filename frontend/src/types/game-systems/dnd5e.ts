/**
 * D&D 5e Character Data Type Definitions (Frontend)
 * Mirrors backend types from backend/src/game-systems/dnd5e.ts
 */

import type { FeatureEntry } from '@/utils/featureEntries';
import type { Dnd5eCustomSkill } from '@/utils/rules/dnd5e';

/**
 * Ability score with modifier
 */
export interface DnD5eAbilityScore {
  score: number;
  modifier: number;
}

/**
 * All ability scores for D&D 5e
 */
export interface DnD5eStats {
  strength: DnD5eAbilityScore;
  dexterity: DnD5eAbilityScore;
  constitution: DnD5eAbilityScore;
  intelligence: DnD5eAbilityScore;
  wisdom: DnD5eAbilityScore;
  charisma: DnD5eAbilityScore;
}

/**
 * Saving throw proficiency and bonus
 */
export interface DnD5eSavingThrow {
  proficient: boolean;
  bonus: number;
}

/**
 * All saving throws
 */
export interface DnD5eSavingThrows {
  strength: DnD5eSavingThrow;
  dexterity: DnD5eSavingThrow;
  constitution: DnD5eSavingThrow;
  intelligence: DnD5eSavingThrow;
  wisdom: DnD5eSavingThrow;
  charisma: DnD5eSavingThrow;
}

/**
 * Skill proficiency, expertise, and bonus
 */
export interface DnD5eSkill {
  proficient: boolean;
  expertise: boolean;
  bonus: number;
}

/**
 * A check the eighteen skills do not cover — a tool proficiency, or anything a
 * table invented.
 *
 * Re-exported from the shared rules module so the sheet type and the maths that
 * derives the bonus cannot describe different shapes.
 */
export type DnD5eCustomSkill = Dnd5eCustomSkill;

/**
 * All D&D 5e skills
 */
export interface DnD5eSkills {
  acrobatics: DnD5eSkill;
  animalHandling: DnD5eSkill;
  arcana: DnD5eSkill;
  athletics: DnD5eSkill;
  deception: DnD5eSkill;
  history: DnD5eSkill;
  insight: DnD5eSkill;
  intimidation: DnD5eSkill;
  investigation: DnD5eSkill;
  medicine: DnD5eSkill;
  nature: DnD5eSkill;
  perception: DnD5eSkill;
  performance: DnD5eSkill;
  persuasion: DnD5eSkill;
  religion: DnD5eSkill;
  sleightOfHand: DnD5eSkill;
  stealth: DnD5eSkill;
  survival: DnD5eSkill;
}

/**
 * Hit points tracking
 */
export interface DnD5eHitPoints {
  maximum: number;
  current: number;
  temporary: number;
}

/**
 * Hit dice for a specific class
 */
export interface DnD5eHitDice {
  class: string;
  total: string;
  remaining: number;
}

/**
 * Death saving throws
 */
export interface DnD5eDeathSaves {
  successes: number;
  failures: number;
}

/**
 * A further way the same weapon or spell deals damage.
 *
 * The rules attach a second die to a weapon often enough that one damage line
 * cannot describe it: a spear is "1d6 piercing" in one hand and "1d8" in two,
 * printed as "versatile (1d8)" in the Weapons table (Basic Rules p. 48). The
 * built-in Longsword template used to record its two-handed die in the free-text
 * note, where it read as prose and could not be rolled.
 *
 * `label` is what the sheet calls this line — "Two-handed", "At 5th level",
 * "Radiant rider" — and is free text, because the reasons are not enumerable.
 */
export interface DnD5eAdditionalDamage {
  label: string;
  damageRoll: string;
  damageType?: string;
}

/**
 * Attack/weapon entry
 */
export interface DnD5eAttack {
  name: string;
  attackBonus: number;
  damageRoll: string;
  damageType: string;
  range: number;
  properties: string[];
  notes: string;
  /** Extra damage lines beyond the primary one. Absent on most attacks. */
  additionalDamage?: DnD5eAdditionalDamage[];
}

/**
 * Currency tracking
 */
export interface DnD5eCurrency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

/**
 * Inventory item
 */
export interface DnD5eInventoryItem {
  name: string;
  quantity: number;
  weight: number;
  notes: string;
  equippable: boolean;
  equipped: boolean;
  requiresAttunement: boolean;
  attuned: boolean;
  value: number;
}

/**
 * Spell slot tracking for a specific level
 */
export interface DnD5eSpellSlot {
  total: number;
  expended: number;
}

/**
 * Spell slots for all levels (1-9)
 */
export interface DnD5eSpellSlots {
  '1': DnD5eSpellSlot;
  '2': DnD5eSpellSlot;
  '3': DnD5eSpellSlot;
  '4': DnD5eSpellSlot;
  '5': DnD5eSpellSlot;
  '6': DnD5eSpellSlot;
  '7': DnD5eSpellSlot;
  '8': DnD5eSpellSlot;
  '9': DnD5eSpellSlot;
}

/**
 * Individual spell entry
 */
export interface DnD5eSpell {
  level: number;
  name: string;
  prepared: boolean;
  ritual: boolean;
  concentration: boolean;
}

/**
 * Spellcasting information
 */
export interface DnD5eSpellcasting {
  class: string;
  ability: string;
  /** Derived: 8 + proficiency bonus + ability modifier + spellSaveDCOtherBonus. */
  spellSaveDC: number;
  /** Derived: proficiency bonus + ability modifier + spellAttackOtherBonus. */
  spellAttackBonus: number;
  /** Adjustments from items and features; separate, since some raise only one. */
  spellSaveDCOtherBonus?: number;
  spellAttackOtherBonus?: number;
  cantrips: string[];
  slots: DnD5eSpellSlots;
  spells: DnD5eSpell[];
}

/**
 * Character appearance
 */
export interface DnD5eAppearance {
  age: number;
  height: string;
  weight: string;
  eyes: string;
  skin: string;
  hair: string;
}

/**
 * Character personality
 */
export interface DnD5ePersonality {
  traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
}

/**
 * Allies and organizations
 */
export interface DnD5eAlliesAndOrganizations {
  name: string;
  description: string;
}

/**
 * Complete D&D 5e character data
 *
 * REQUIRED fields:
 * - characterName, class, level, race, proficiencyBonus, stats
 *
 * OPTIONAL fields:
 * - All other fields (can be added progressively)
 */
export interface DnD5eCharacterData {
  // Required: Core identity
  characterName: string;
  class: string;
  level: number;
  race: string;
  proficiencyBonus: number;
  stats: DnD5eStats;

  // Optional: Additional details
  playerName?: string;
  background?: string;
  alignment?: string;
  experiencePoints?: number;
  inspiration?: boolean;
  savingThrows?: DnD5eSavingThrows;
  skills?: DnD5eSkills;
  /**
   * Checks the eighteen skills do not cover — tool proficiencies above all.
   *
   * The bonus is derived by `dnd5eCustomSkillBonus`, not stored, so it follows
   * the character's ability scores and level without anyone re-entering it.
   */
  customSkills?: DnD5eCustomSkill[];
  /** Total passive Perception: 10 + Perception bonus + `passivePerceptionBonus`. */
  passivePerception?: number;
  /** Non-skill additions to passive Perception (Observant, items). */
  passivePerceptionBonus?: number;
  armorClass?: number;
  /** Total initiative modifier: Dexterity modifier plus `initiativeBonus`. */
  initiative?: number;
  /** Non-Dexterity initiative bonuses (Alert, Jack of All Trades, subclasses). */
  initiativeBonus?: number;
  speed?: number;
  hp?: DnD5eHitPoints;
  conditions?: string[];
  /** Exhaustion 0-6; six cumulative levels, not a yes/no condition. */
  exhaustionLevel?: number;
  hitDice?: DnD5eHitDice[];
  deathSaves?: DnD5eDeathSaves;
  attacks?: DnD5eAttack[];
  currency?: DnD5eCurrency;
  inventory?: DnD5eInventoryItem[];
  /**
   * The four proficiency boxes as the player typed them, each free text.
   *
   * `proficienciesAndLanguages` below is the same four flattened into one list,
   * kept for exports and for sheets written before this existed. It cannot
   * replace this: flattening loses which box an entry came from, and guessing
   * it back put anything unrecognised — Thieves' Cant, Druidic — under weapons.
   */
  proficiencies?: {
    armor?: string;
    weapons?: string;
    tools?: string;
    languages?: string;
  };
  proficienciesAndLanguages?: string[];
  /**
   * Features and traits: a name plus an optional description.
   *
   * Strings are still read, because every sheet saved before descriptions
   * existed holds them and so does any exported JSON. They mean a feature with
   * no description, and are never split apart to invent one — see
   * utils/featureEntries.
   */
  featuresAndTraits?: Array<string | FeatureEntry>;
  spellcasting?: DnD5eSpellcasting;
  appearance?: DnD5eAppearance;
  personality?: DnD5ePersonality;
  backstory?: string;
  alliesAndOrganizations?: DnD5eAlliesAndOrganizations;
  treasure?: string;
  additionalFeaturesAndTraits?: string;
}
