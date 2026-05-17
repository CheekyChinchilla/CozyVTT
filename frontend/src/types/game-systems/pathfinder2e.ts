/**
 * Pathfinder 2e Character Data Type Definitions (Frontend)
 * Mirrors backend types from backend/src/game-systems/pathfinder2e.ts
 */

/**
 * Ability score with modifier
 */
export interface PF2eAbilityScore {
  score: number;
  modifier: number;
}

/**
 * All ability scores for Pathfinder 2e
 */
export interface PF2eAttributes {
  strength: PF2eAbilityScore;
  dexterity: PF2eAbilityScore;
  constitution: PF2eAbilityScore;
  intelligence: PF2eAbilityScore;
  wisdom: PF2eAbilityScore;
  charisma: PF2eAbilityScore;
}

/**
 * Proficiency ranks in Pathfinder 2e
 */
export type PF2eProficiencyRank = 'untrained' | 'trained' | 'expert' | 'master' | 'legendary';

/**
 * Saving throw with proficiency
 */
export interface PF2eSavingThrow {
  proficiencyRank: PF2eProficiencyRank;
  itemBonus: number;
  bonus: number;
}

/**
 * All saving throws
 */
export interface PF2eSavingThrows {
  fortitude: PF2eSavingThrow;
  reflex: PF2eSavingThrow;
  will: PF2eSavingThrow;
}

/**
 * Perception
 */
export interface PF2ePerception {
  proficiencyRank: PF2eProficiencyRank;
  itemBonus: number;
  bonus: number;
  senses: string[];
}

/**
 * Skill with proficiency
 */
export interface PF2eSkill {
  attribute: string;
  proficiencyRank: PF2eProficiencyRank;
  armorPenalty: number;
  itemBonus: number;
  bonus: number;
}

/**
 * All Pathfinder 2e skills
 */
export interface PF2eSkills {
  acrobatics: PF2eSkill;
  arcana: PF2eSkill;
  athletics: PF2eSkill;
  crafting: PF2eSkill;
  deception: PF2eSkill;
  diplomacy: PF2eSkill;
  intimidation: PF2eSkill;
  medicine: PF2eSkill;
  nature: PF2eSkill;
  occultism: PF2eSkill;
  performance: PF2eSkill;
  religion: PF2eSkill;
  society: PF2eSkill;
  stealth: PF2eSkill;
  survival: PF2eSkill;
  thievery: PF2eSkill;
}

/**
 * Lore skill
 */
export interface PF2eLoreSkill {
  name: string;
  attribute: string;
  proficiencyRank: PF2eProficiencyRank;
  itemBonus: number;
  bonus: number;
}

/**
 * Armor Class
 */
export interface PF2eArmorClass {
  total: number;
  proficiencyRank: PF2eProficiencyRank;
  capDex: number | null;
  itemBonus: number;
  armorPenalty: number;
}

/**
 * Class DC
 */
export interface PF2eClassDC {
  total: number;
  keyAttribute: string;
  proficiencyRank: PF2eProficiencyRank;
}

/**
 * Initiative
 */
export interface PF2eInitiative {
  usedStat: string;
  bonus: number;
}

/**
 * Speed
 */
export interface PF2eSpeed {
  land: number;
  other: string[];
}

/**
 * Hit points
 */
export interface PF2eHitPoints {
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
export interface PF2eDeathAndDying {
  dying: number;
  wounded: number;
  doomed: number;
}

/**
 * Weapon proficiencies
 */
export interface PF2eWeaponProficiencies {
  simple: PF2eProficiencyRank;
  martial: PF2eProficiencyRank;
  advanced: PF2eProficiencyRank;
  unarmed: PF2eProficiencyRank;
}

/**
 * Armor proficiencies
 */
export interface PF2eArmorProficiencies {
  unarmored: PF2eProficiencyRank;
  light: PF2eProficiencyRank;
  medium: PF2eProficiencyRank;
  heavy: PF2eProficiencyRank;
}

/**
 * All proficiencies
 */
export interface PF2eProficiencies {
  weapons: PF2eWeaponProficiencies;
  armor: PF2eArmorProficiencies;
}

/**
 * Strike/attack
 */
export interface PF2eStrike {
  name: string;
  type: 'melee' | 'ranged';
  attackBonus: number | null;
  damageRoll: string;
  damageType: string;
  attributeModifier: string;
  proficiencyRank: PF2eProficiencyRank;
  itemBonus: number;
  traits: string[];
  range: number | null;
  savingThrow?: string;
  notes: string;
}

/**
 * Currency
 */
export interface PF2eCurrency {
  cp: number;
  sp: number;
  gp: number;
  pp: number;
}

/**
 * Inventory item
 */
export interface PF2eInventoryItem {
  name: string;
  quantity: number;
  bulk: number | string;
  equippable: boolean;
  equipped: boolean;
  requiresAttunement: boolean;
  attuned: boolean;
  invested: boolean;
  value: number;
  notes: string;
}

/**
 * Bulk tracking
 */
export interface PF2eBulk {
  current: number;
  encumbered: number;
  maximum: number;
}

/**
 * Feat entry
 */
export interface PF2eFeat {
  level: number;
  name: string;
  notes: string;
}

/**
 * All feat categories
 */
export interface PF2eFeats {
  ancestryAndHeritage: PF2eFeat[];
  class: PF2eFeat[];
  skill: PF2eFeat[];
  general: PF2eFeat[];
  bonus: PF2eFeat[];
}

/**
 * Spell slot tracking
 */
export interface PF2eSpellSlot {
  total: number;
  expended: number;
}

/**
 * Spell slots for all ranks (1-10)
 */
export interface PF2eSpellSlots {
  '1': PF2eSpellSlot;
  '2': PF2eSpellSlot;
  '3': PF2eSpellSlot;
  '4': PF2eSpellSlot;
  '5': PF2eSpellSlot;
  '6': PF2eSpellSlot;
  '7': PF2eSpellSlot;
  '8': PF2eSpellSlot;
  '9': PF2eSpellSlot;
  '10': PF2eSpellSlot;
}

/**
 * Cantrip
 */
export interface PF2eCantrip {
  rank: number;
  name: string;
  prepared: boolean;
}

/**
 * Spell
 */
export interface PF2eSpell {
  rank: number;
  name: string;
  prepared: boolean;
  ritual: boolean;
  heightened: boolean;
}

/**
 * Spell attack bonus
 */
export interface PF2eSpellAttackBonus {
  proficiencyRank: PF2eProficiencyRank;
  itemBonus: number;
  bonus: number;
}

/**
 * Spell DC
 */
export interface PF2eSpellDC {
  proficiencyRank: PF2eProficiencyRank;
  itemBonus: number;
  dc: number;
}

/**
 * Focus spells
 */
export interface PF2eFocusSpells {
  focusPoints: {
    total: number;
    current: number;
  };
  spells: PF2eSpell[];
}

/**
 * Innate spell
 */
export interface PF2eInnateSpell {
  rank: number;
  name: string;
  tradition: string;
  frequency: string;
  notes: string;
}

/**
 * Spellcasting
 */
export interface PF2eSpellcasting {
  tradition: string;
  type: string;
  keyAttribute: string;
  spellAttackBonus: PF2eSpellAttackBonus;
  spellDC: PF2eSpellDC;
  cantrips: PF2eCantrip[];
  slots: PF2eSpellSlots;
  spells: PF2eSpell[];
  focusSpells: PF2eFocusSpells;
  innateSpells: PF2eInnateSpell[];
  rituals: string[];
}

/**
 * Character appearance
 */
export interface PF2eAppearance {
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
export interface PF2ePersonality {
  traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
}

/**
 * Allies and organizations
 */
export interface PF2eAlliesAndOrganizations {
  name: string;
  description: string;
}

/**
 * Complete Pathfinder 2e character data
 */
/**
 * Complete Pathfinder 2e character data
 *
 * REQUIRED fields:
 * - characterName, class, level, ancestry, heritage, attributes
 *
 * OPTIONAL fields:
 * - All other fields (can be added progressively)
 */
export interface PF2eCharacterData {
  // Required: Core identity
  characterName: string;
  class: string;
  level: number;
  ancestry: string;
  heritage: string;
  attributes: PF2eAttributes;

  // Optional: Additional details
  playerName?: string;
  background?: string;
  alignment?: string;
  deity?: string;
  experiencePoints?: number;
  heroPoints?: number;
  savingThrows?: PF2eSavingThrows;
  perception?: PF2ePerception;
  skills?: PF2eSkills;
  loreSkills?: PF2eLoreSkill[];
  armorClass?: PF2eArmorClass;
  classDC?: PF2eClassDC;
  initiative?: PF2eInitiative;
  speed?: PF2eSpeed;
  hp?: PF2eHitPoints;
  conditions?: string[];
  deathAndDying?: PF2eDeathAndDying;
  proficiencies?: PF2eProficiencies;
  strikes?: PF2eStrike[];
  currency?: PF2eCurrency;
  inventory?: PF2eInventoryItem[];
  bulk?: PF2eBulk;
  languages?: string[];
  feats?: PF2eFeats;
  classFeatures?: string[];
  spellcasting?: PF2eSpellcasting;
  appearance?: PF2eAppearance;
  personality?: PF2ePersonality;
  backstory?: string;
  alliesAndOrganizations?: PF2eAlliesAndOrganizations;
  notes?: string;
  treasure?: string;
}
