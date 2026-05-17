/**
 * Shadowrun 6e Character Data Type Definitions (Frontend)
 * Mirrors backend types from backend/src/game-systems/shadowrun6e.ts
 */

/**
 * Karma tracking
 */
export interface SR6Karma {
  current: number;
  total: number;
}

/**
 * Personal data
 */
export interface SR6PersonalData {
  age: number;
  sex: string;
  height: string;
  weight: string;
  ethnicity: string;
  lifestyle: string;
  primaryArmor: string;
  primaryRangedWeapon: string;
  primaryMeleeWeapon: string;
}

/**
 * Attribute value with base and augmented
 */
export interface SR6Attribute {
  base: number;
  augmented: number;
}

/**
 * Physical attributes
 */
export interface SR6PhysicalAttributes {
  body: SR6Attribute;
  agility: SR6Attribute;
  reaction: SR6Attribute;
  strength: SR6Attribute;
}

/**
 * Mental attributes
 */
export interface SR6MentalAttributes {
  willpower: SR6Attribute;
  logic: SR6Attribute;
  intuition: SR6Attribute;
  charisma: SR6Attribute;
}

/**
 * Special attributes
 */
export interface SR6SpecialAttributes {
  edge: SR6Attribute;
  essence: {
    current: number;
    maximum: number;
  };
  magic: number | null;
  resonance: number | null;
}

/**
 * All attributes
 */
export interface SR6Attributes {
  physical: SR6PhysicalAttributes;
  mental: SR6MentalAttributes;
  special: SR6SpecialAttributes;
}

/**
 * Initiative tracking
 */
export interface SR6Initiative {
  base: number | null;
  dicePools: string;
  formula: string;
}

/**
 * Initiative for different contexts
 */
export interface SR6InitiativeStats {
  meatspace: SR6Initiative;
  astral: SR6Initiative | null;
  matrix: SR6Initiative | null;
}

/**
 * Derived stat with dice pool
 */
export interface SR6DerivedStat {
  dicePool: number;
  formula: string;
}

/**
 * Movement
 */
export interface SR6Movement {
  walk: string;
  sprint: string;
}

/**
 * Unarmed damage value
 */
export interface SR6UnarmedDV {
  formula: string;
  value: number;
}

/**
 * All derived stats
 */
export interface SR6DerivedStats {
  initiative: SR6InitiativeStats;
  composure: SR6DerivedStat;
  judgeIntentions: SR6DerivedStat;
  memory: SR6DerivedStat;
  liftCarry: SR6DerivedStat;
  movement: SR6Movement;
  unarmededDV: SR6UnarmedDV;
  defenseRating: number;
}

/**
 * Edge points
 */
export interface SR6EdgePoints {
  maximum: number;
  current: number;
}

/**
 * Condition monitor
 */
export interface SR6ConditionMonitor {
  maximum: number;
  current: number;
  formula: string;
}

/**
 * All condition monitors
 */
export interface SR6ConditionMonitors {
  physical: SR6ConditionMonitor;
  stun: SR6ConditionMonitor;
  overflow: SR6ConditionMonitor;
}

/**
 * Skill
 */
export interface SR6Skill {
  rank: number;
  linkedAttribute: string;
  specialization: string | null;
  expertise: string | null;
  canDefault: boolean;
}

/**
 * All skills
 */
export interface SR6Skills {
  astral: SR6Skill;
  athletics: SR6Skill;
  biotech: SR6Skill;
  closeCombat: SR6Skill;
  con: SR6Skill;
  conjuring: SR6Skill;
  cracking: SR6Skill;
  electronics: SR6Skill;
  enchanting: SR6Skill;
  engineering: SR6Skill;
  exoticWeapons: SR6Skill;
  firearms: SR6Skill;
  influence: SR6Skill;
  outdoors: SR6Skill;
  perception: SR6Skill;
  piloting: SR6Skill;
  sorcery: SR6Skill;
  stealth: SR6Skill;
  tasking: SR6Skill;
}

/**
 * Knowledge skill
 */
export interface SR6KnowledgeSkill {
  name: string;
  type: 'academic' | 'professional' | 'street';
  rank: number;
}

/**
 * Language proficiency
 */
export interface SR6Language {
  name: string;
  proficiency: 'native' | 'fluent' | 'basic';
}

/**
 * Quality (positive or negative trait)
 */
export interface SR6Quality {
  name: string;
  type: 'positive' | 'negative';
  cost: number;
  notes: string;
}

/**
 * Attack ratings for different ranges
 */
export interface SR6AttackRatings {
  close: number;
  near?: number;
  far?: number;
  extreme?: number | null;
}

/**
 * Ranged weapon
 */
export interface SR6RangedWeapon {
  name: string;
  type: string;
  dicePool: number;
  dv: string;
  attackRatings: SR6AttackRatings;
  firingModes: string[];
  capacity: number;
  ammoLoaded: number;
  ammoType: string;
  notes: string;
}

/**
 * Melee weapon
 */
export interface SR6MeleeWeapon {
  name: string;
  type: string;
  dicePool: number;
  dv: string;
  attackRatings: SR6AttackRatings;
  notes: string;
}

/**
 * All weapons
 */
export interface SR6Weapons {
  ranged: SR6RangedWeapon[];
  melee: SR6MeleeWeapon[];
}

/**
 * Armor
 */
export interface SR6Armor {
  name: string;
  defenseRating: number;
  notes: string;
  equipped: boolean;
}

/**
 * Augmentation
 */
export interface SR6Augmentation {
  name: string;
  rating: number;
  essenceCost: number;
  type: 'cyberware' | 'bioware';
  notes: string;
}

/**
 * Matrix persona attributes
 */
export interface SR6MatrixPersona {
  attack: number;
  sleaze: number;
  dataProcessing: number;
  firewall: number;
}

/**
 * Matrix initiative
 */
export interface SR6MatrixInitiative {
  base: number | null;
  dicePools: string | null;
  notes: string;
}

/**
 * Matrix statistics
 */
export interface SR6MatrixStats {
  hasMatrixDevice: boolean;
  commlink: string;
  persona: SR6MatrixPersona;
  matrixConditionMonitor: {
    maximum: number;
    current: number;
  };
  programs: string[];
  matrixInitiative: SR6MatrixInitiative;
}

/**
 * Magic information
 */
export interface SR6Magic {
  isMagicallyActive: boolean;
  tradition: string | null;
  magicRating: number | null;
  spells: string[];
  rituals: string[];
  preparations: string[];
  complexForms: string[];
  adeptPowers: string[];
  initiationGrade: number;
  submersionGrade: number;
  focii: string[];
}

/**
 * Contact
 */
export interface SR6Contact {
  name: string;
  role: string;
  loyalty: number;
  connection: number;
  notes: string;
}

/**
 * License
 */
export interface SR6License {
  type: string;
  rating: number;
}

/**
 * Fake ID
 */
export interface SR6FakeID {
  name: string;
  type: string;
  rating: number;
  licenses: SR6License[];
}

/**
 * Currency
 */
export interface SR6Currency {
  nuyen: number;
}

/**
 * Gear item
 */
export interface SR6GearItem {
  name: string;
  rating: number | null;
  quantity: number;
  notes: string;
}

/**
 * Character appearance
 */
export interface SR6Appearance {
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
export interface SR6Personality {
  traits: string;
  ideals: string;
  bonds: string;
  flaws: string;
}

/**
 * Complete Shadowrun 6e character data
 */
/**
 * Complete Shadowrun 6e character data
 *
 * REQUIRED fields:
 * - characterName, metatype, archetype, attributes
 *
 * OPTIONAL fields:
 * - All other fields (can be added progressively)
 */
export interface SR6CharacterData {
  // Required: Core identity
  characterName: string;
  metatype: string;
  archetype: string;
  attributes: SR6Attributes;

  // Optional: Additional details
  playerName?: string;
  primaryAlias?: string;
  karma?: SR6Karma;
  reputation?: number;
  heat?: number;
  personalData?: SR6PersonalData;
  derivedStats?: SR6DerivedStats;
  edgePoints?: SR6EdgePoints;
  conditionMonitors?: SR6ConditionMonitors;
  woundModifier?: number;
  conditions?: string[];
  skills?: SR6Skills;
  knowledgeSkills?: SR6KnowledgeSkill[];
  languages?: SR6Language[];
  qualities?: SR6Quality[];
  weapons?: SR6Weapons;
  armor?: SR6Armor[];
  augmentations?: SR6Augmentation[];
  matrixStats?: SR6MatrixStats;
  magic?: SR6Magic;
  contacts?: SR6Contact[];
  ids?: SR6FakeID[];
  currency?: SR6Currency;
  gear?: SR6GearItem[];
  vehicles?: string[];
  appearance?: SR6Appearance;
  personality?: SR6Personality;
  backstory?: string;
  notes?: string;
}
