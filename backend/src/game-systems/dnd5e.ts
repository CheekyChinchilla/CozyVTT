/**
 * D&D 5e Character Data Type Definitions
 * Based on /Examples/DnD_5e_character.json
 */

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
  spellSaveDC: number;
  spellAttackBonus: number;
  cantrips: string[];
  slots: DnD5eSpellSlots;
  spells: DnD5eSpell[];
}

/**
 * Character appearance
 */
export interface DnD5eAppearance {
  age: string | number;
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
 */
export interface DnD5eCharacterData {
  characterName: string;
  playerName: string;
  class: string;
  level: number;
  background: string;
  race: string;
  alignment: string;
  experiencePoints: number;
  inspiration: boolean;
  proficiencyBonus: number;
  stats: DnD5eStats;
  savingThrows: DnD5eSavingThrows;
  skills: DnD5eSkills;
  passivePerception: number;
  armorClass: number;
  initiative: number;
  speed: number;
  hp: DnD5eHitPoints;
  conditions: string[];
  hitDice: DnD5eHitDice[];
  deathSaves: DnD5eDeathSaves;
  attacks: DnD5eAttack[];
  currency: DnD5eCurrency;
  inventory: DnD5eInventoryItem[];
  proficienciesAndLanguages: string[];
  featuresAndTraits: string[];
  spellcasting?: DnD5eSpellcasting;
  appearance: DnD5eAppearance;
  personality: DnD5ePersonality;
  backstory: string;
  alliesAndOrganizations: DnD5eAlliesAndOrganizations;
  treasure: string;
  additionalFeaturesAndTraits: string;
}
