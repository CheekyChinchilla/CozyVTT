// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * Fantasy d20 Character Data Type Definitions (Frontend)
 *
 * The shape the backend's schema accepts (backend/src/validators/game-systems/
 * fantasyD20.schema.ts), which decides what is stored. A field the schema lets be
 * absent is optional here, since the server sends a sheet as it was stored.
 * backend/src/__tests__/keepInStep.test.ts fails when the two disagree.
 */

import type { SheetChrome } from './sheetChrome';
import type { FeatureEntry } from '@/utils/featureEntries';

/**
 * Ability score with modifier
 */
export interface FantasyD20AbilityScore {
  score: number;
  modifier: number;
}

/**
 * All ability scores for Fantasy d20
 */
export interface FantasyD20Attributes {
  strength: FantasyD20AbilityScore;
  dexterity: FantasyD20AbilityScore;
  constitution: FantasyD20AbilityScore;
  intelligence: FantasyD20AbilityScore;
  wisdom: FantasyD20AbilityScore;
  charisma: FantasyD20AbilityScore;
}

/**
 * Proficiency ranks in Fantasy d20
 */
export type FantasyD20ProficiencyRank = 'untrained' | 'trained' | 'expert' | 'master' | 'legendary';

/**
 * Saving throw with proficiency
 */
export interface FantasyD20SavingThrow {
  proficiencyRank: FantasyD20ProficiencyRank;
  itemBonus: number;
  bonus: number;
}

/**
 * All saving throws
 */
export interface FantasyD20SavingThrows {
  fortitude: FantasyD20SavingThrow;
  reflex: FantasyD20SavingThrow;
  will: FantasyD20SavingThrow;
}

/**
 * Perception
 */
export interface FantasyD20Perception {
  proficiencyRank: FantasyD20ProficiencyRank;
  itemBonus: number;
  bonus: number;
  senses: string[];
}

/**
 * Skill with proficiency
 */
export interface FantasyD20Skill {
  attribute: string;
  proficiencyRank: FantasyD20ProficiencyRank;
  armorPenalty: number;
  itemBonus: number;
  bonus: number;
}

/**
 * All Fantasy d20 skills
 */
export interface FantasyD20Skills {
  acrobatics: FantasyD20Skill;
  arcana: FantasyD20Skill;
  athletics: FantasyD20Skill;
  crafting: FantasyD20Skill;
  deception: FantasyD20Skill;
  diplomacy: FantasyD20Skill;
  intimidation: FantasyD20Skill;
  medicine: FantasyD20Skill;
  nature: FantasyD20Skill;
  occultism: FantasyD20Skill;
  performance: FantasyD20Skill;
  religion: FantasyD20Skill;
  society: FantasyD20Skill;
  stealth: FantasyD20Skill;
  survival: FantasyD20Skill;
  thievery: FantasyD20Skill;
}

/**
 * Lore skill
 */
export interface FantasyD20LoreSkill {
  name: string;
  attribute: string;
  proficiencyRank: FantasyD20ProficiencyRank;
  itemBonus: number;
  bonus: number;
}

/**
 * Armor Class
 */
export interface FantasyD20ArmorClass {
  total: number;
  proficiencyRank: FantasyD20ProficiencyRank;
  capDex: number | null;
  itemBonus: number;
  armorPenalty: number;
}

/**
 * Class DC
 */
export interface FantasyD20ClassDC {
  total: number;
  keyAttribute: string;
  proficiencyRank: FantasyD20ProficiencyRank;
}

/**
 * Initiative
 */
export interface FantasyD20Initiative {
  usedStat: string;
  bonus: number;
}

/**
 * Speed
 */
export interface FantasyD20Speed {
  land: number;
  other: string[];
}

/**
 * Hit points
 */
export interface FantasyD20HitPoints {
  maximum: number;
  ancestryHp: number;
  classHpPerLevel: number;
  current: number;
  temporary: number;
  resistances: string[];
  immunities: string[];
  weaknesses: string[];
}

/**
 * Death and dying conditions
 */
export interface FantasyD20DeathAndDying {
  dying: number;
  wounded: number;
  doomed: number;
}

/**
 * Weapon proficiencies
 */
export interface FantasyD20WeaponProficiencies {
  simple: FantasyD20ProficiencyRank;
  martial: FantasyD20ProficiencyRank;
  advanced: FantasyD20ProficiencyRank;
  unarmed: FantasyD20ProficiencyRank;
}

/**
 * Armor proficiencies
 */
export interface FantasyD20ArmorProficiencies {
  unarmored: FantasyD20ProficiencyRank;
  light: FantasyD20ProficiencyRank;
  medium: FantasyD20ProficiencyRank;
  heavy: FantasyD20ProficiencyRank;
}

/**
 * All proficiencies
 */
export interface FantasyD20Proficiencies {
  weapons: FantasyD20WeaponProficiencies;
  armor: FantasyD20ArmorProficiencies;
}

/**
 * Strike/attack
 */
export interface FantasyD20Strike {
  name: string;
  type?: 'melee' | 'ranged';
  attackBonus?: number | null;
  damageRoll?: string;
  damageType?: string;
  attributeModifier?: string;
  proficiencyRank?: FantasyD20ProficiencyRank;
  itemBonus?: number;
  traits?: string[];
  range?: number | null;
  savingThrow?: string;
  notes?: string;
}

/**
 * Currency
 */
export interface FantasyD20Currency {
  cp: number;
  sp: number;
  gp: number;
  pp: number;
}

/**
 * Inventory item
 */
export interface FantasyD20InventoryItem {
  name: string;
  quantity?: number;
  bulk?: number | string;
  equippable?: boolean;
  equipped?: boolean;
  requiresAttunement?: boolean;
  attuned?: boolean;
  invested?: boolean;
  value?: number;
  notes?: string;
}

/**
 * Bulk tracking
 */
export interface FantasyD20Bulk {
  current: number;
  encumbered: number;
  maximum: number;
}

/**
 * Feat entry
 */
export interface FantasyD20Feat {
  level?: number;
  name: string;
  notes?: string;
  /** What the editor's text box under the feat holds. */
  description?: string;
}

/**
 * All feat categories
 */
export interface FantasyD20Feats {
  ancestryAndHeritage: FantasyD20Feat[];
  class: FantasyD20Feat[];
  skill: FantasyD20Feat[];
  general: FantasyD20Feat[];
  bonus: FantasyD20Feat[];
}

/**
 * Spell slot tracking
 */
export interface FantasyD20SpellSlot {
  total: number;
  expended: number;
}

/**
 * Spell slots for all ranks (1-10)
 */
export interface FantasyD20SpellSlots {
  '1': FantasyD20SpellSlot;
  '2': FantasyD20SpellSlot;
  '3': FantasyD20SpellSlot;
  '4': FantasyD20SpellSlot;
  '5': FantasyD20SpellSlot;
  '6': FantasyD20SpellSlot;
  '7': FantasyD20SpellSlot;
  '8': FantasyD20SpellSlot;
  '9': FantasyD20SpellSlot;
  '10': FantasyD20SpellSlot;
}

/**
 * Cantrip
 */
/**
 * A ritual, as either a bare name or a name with the rank it is cast at.
 *
 * The editor writes the second; the backend schema accepts both, so a sheet
 * written when only the bare name was allowed still loads.
 */
export type FantasyD20Ritual = string | { name: string; rank: number };

export interface FantasyD20Cantrip {
  rank: number;
  name: string;
  prepared: boolean;
}

/**
 * Spell
 */
export interface FantasyD20Spell {
  rank: number;
  name: string;
  prepared: boolean;
  ritual: boolean;
  heightened: boolean;
}

/**
 * Spell attack bonus
 */
export interface FantasyD20SpellAttackBonus {
  proficiencyRank: FantasyD20ProficiencyRank;
  itemBonus: number;
  bonus: number;
}

/**
 * Spell DC
 */
export interface FantasyD20SpellDC {
  proficiencyRank: FantasyD20ProficiencyRank;
  itemBonus: number;
  dc: number;
}

/**
 * Focus spells
 */
export interface FantasyD20FocusSpells {
  focusPoints: {
    total: number;
    current: number;
  };
  spells: FantasyD20Spell[];
}

/**
 * Innate spell
 */
export interface FantasyD20InnateSpell {
  rank?: number;
  name: string;
  tradition?: string;
  frequency?: string;
  notes?: string;
}

/**
 * Spellcasting
 */
export interface FantasyD20Spellcasting {
  tradition?: string;
  type?: string;
  keyAttribute?: string;
  spellAttackBonus?: FantasyD20SpellAttackBonus;
  spellDC?: FantasyD20SpellDC;
  cantrips?: FantasyD20Cantrip[];
  slots?: FantasyD20SpellSlots;
  spells?: FantasyD20Spell[];
  focusSpells?: FantasyD20FocusSpells;
  innateSpells?: FantasyD20InnateSpell[];
  rituals?: FantasyD20Ritual[];
}

/**
 * Character appearance
 */
export interface FantasyD20Appearance {
  age?: string | number | null;
  height?: string;
  weight?: string;
  eyes?: string;
  skin?: string;
  hair?: string;
}

/**
 * Character personality
 */
export interface FantasyD20Personality {
  traits?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
}

/**
 * Allies and organizations
 */
export interface FantasyD20AlliesAndOrganizations {
  name?: string;
  description?: string;
}

/**
 * Complete Fantasy d20 character data
 */
/**
 * Complete Fantasy d20 character data
 *
 * REQUIRED fields:
 * - characterName, class, level, ancestry, heritage, attributes
 *
 * OPTIONAL fields:
 * - All other fields (can be added progressively)
 */
export interface FantasyD20CharacterData extends SheetChrome {
  // Required: Core identity
  characterName: string;
  class: string;
  level: number;
  ancestry: string;
  heritage: string;
  attributes: FantasyD20Attributes;

  // Optional: Additional details
  playerName?: string;
  background?: string;
  alignment?: string;
  deity?: string;
  experiencePoints?: number;
  heroPoints?: number;
  savingThrows?: FantasyD20SavingThrows;
  perception?: FantasyD20Perception;
  skills?: FantasyD20Skills;
  loreSkills?: FantasyD20LoreSkill[];
  armorClass?: FantasyD20ArmorClass;
  classDC?: FantasyD20ClassDC;
  initiative?: FantasyD20Initiative;
  speed?: FantasyD20Speed;
  hp?: FantasyD20HitPoints;
  conditions?: string[];
  deathAndDying?: FantasyD20DeathAndDying;
  proficiencies?: FantasyD20Proficiencies;
  strikes?: FantasyD20Strike[];
  currency?: FantasyD20Currency;
  inventory?: FantasyD20InventoryItem[];
  bulk?: FantasyD20Bulk;
  languages?: string[];
  feats?: FantasyD20Feats;
  /**
   * Class features: a name with optional rules text. Strings are still read,
   * meaning a feature with no description. See utils/featureEntries.
   */
  classFeatures?: Array<string | FeatureEntry>;
  spellcasting?: FantasyD20Spellcasting;
  appearance?: FantasyD20Appearance;
  personality?: FantasyD20Personality;
  backstory?: string;
  alliesAndOrganizations?: FantasyD20AlliesAndOrganizations;
  notes?: string;
  treasure?: string;
}
