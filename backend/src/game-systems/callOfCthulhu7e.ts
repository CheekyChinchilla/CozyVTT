/**
 * Call of Cthulhu 7th Edition Character Data Type Definitions
 * Based on /Examples/Call_of_Cthulhu_7th_Edition_character.json
 */

/**
 * Characteristic with regular, half, and fifth values
 */
export interface CoC7eCharacteristic {
  regular: number;
  half: number;
  fifth: number;
}

/**
 * All characteristics
 */
export interface CoC7eCharacteristics {
  STR: CoC7eCharacteristic;
  CON: CoC7eCharacteristic;
  SIZ: CoC7eCharacteristic;
  DEX: CoC7eCharacteristic;
  APP: CoC7eCharacteristic;
  INT: CoC7eCharacteristic;
  POW: CoC7eCharacteristic;
  EDU: CoC7eCharacteristic;
}

/**
 * Hit points
 */
export interface CoC7eHitPoints {
  maximum: number;
  current: number;
  formula: string;
  majorWoundThreshold: number;
}

/**
 * Sanity tracking
 */
export interface CoC7eSanity {
  starting: number;
  maximum: number;
  current: number;
  formula: string;
}

/**
 * Magic points
 */
export interface CoC7eMagicPoints {
  maximum: number;
  current: number;
  formula: string;
}

/**
 * Luck
 */
export interface CoC7eLuck {
  score: number;
  notes: string;
}

/**
 * Dodge skill
 */
export interface CoC7eDodge {
  value: number;
  formula: string;
  improvementChecked: boolean;
}

/**
 * All derived stats
 */
export interface CoC7eDerivedStats {
  hp: CoC7eHitPoints;
  sanity: CoC7eSanity;
  magicPoints: CoC7eMagicPoints;
  luck: CoC7eLuck;
  damageBonus: string;
  build: number;
  moveRate: number;
  dodge: CoC7eDodge;
}

/**
 * Skill
 */
export interface CoC7eSkill {
  baseValue: number;
  currentValue: number;
  improvementChecked: boolean;
  specialization?: string | null;
  notes?: string;
}

/**
 * Fighting skill entry
 */
export interface CoC7eFightingSkill {
  baseValue: number;
  currentValue: number;
  improvementChecked: boolean;
}

/**
 * Fighting skills
 */
export interface CoC7eFightingSkills {
  brawl: CoC7eFightingSkill;
  custom: CoC7eFightingSkill[];
}

/**
 * Firearms skill entry
 */
export interface CoC7eFirearmsSkill {
  baseValue: number;
  currentValue: number;
  improvementChecked: boolean;
}

/**
 * Firearms skills
 */
export interface CoC7eFirearmsSkills {
  handgun: CoC7eFirearmsSkill;
  rifle: CoC7eFirearmsSkill;
  shotgun: CoC7eFirearmsSkill;
  custom: CoC7eFirearmsSkill[];
}

/**
 * Language skill
 */
export interface CoC7eLanguageSkill {
  language: string;
  baseValue: number;
  currentValue: number;
  improvementChecked: boolean;
}

/**
 * Science skill specialization
 */
export interface CoC7eScienceSkill {
  specialization: string;
  baseValue: number;
  currentValue: number;
  improvementChecked: boolean;
}

/**
 * All skills
 */
export interface CoC7eSkills {
  accounting: CoC7eSkill;
  anthropology: CoC7eSkill;
  appraise: CoC7eSkill;
  archaeology: CoC7eSkill;
  artCraft: CoC7eSkill;
  charm: CoC7eSkill;
  climb: CoC7eSkill;
  creditRating: CoC7eSkill;
  cthulhuMythos: CoC7eSkill;
  disguise: CoC7eSkill;
  dodge: CoC7eSkill;
  driveAuto: CoC7eSkill;
  electricalRepair: CoC7eSkill;
  fastTalk: CoC7eSkill;
  fighting: CoC7eFightingSkills;
  firearms: CoC7eFirearmsSkills;
  firstAid: CoC7eSkill;
  history: CoC7eSkill;
  intimidate: CoC7eSkill;
  jump: CoC7eSkill;
  languageOwn: CoC7eSkill & { language: string };
  languageOther: CoC7eLanguageSkill[];
  law: CoC7eSkill;
  libraryUse: CoC7eSkill;
  listen: CoC7eSkill;
  locksmith: CoC7eSkill;
  mechanicalRepair: CoC7eSkill;
  medicine: CoC7eSkill;
  naturalWorld: CoC7eSkill;
  navigate: CoC7eSkill;
  occult: CoC7eSkill;
  operateHeavyMachinery: CoC7eSkill;
  persuade: CoC7eSkill;
  pilot: CoC7eSkill;
  psychoanalysis: CoC7eSkill;
  psychology: CoC7eSkill;
  ride: CoC7eSkill;
  science: CoC7eScienceSkill[];
  sleightOfHand: CoC7eSkill;
  spotHidden: CoC7eSkill;
  stealth: CoC7eSkill;
  survival: CoC7eSkill;
  swim: CoC7eSkill;
  throw: CoC7eSkill;
  track: CoC7eSkill;
  customSkills: CoC7eSkill[];
}

/**
 * Weapon
 */
export interface CoC7eWeapon {
  name: string;
  skill: string;
  skillValue: number;
  damage: string;
  range: string;
  attacks: number;
  ammo: number | null;
  malfunction: number | null;
  notes: string;
}

/**
 * Combat information
 */
export interface CoC7eCombat {
  weapons: CoC7eWeapon[];
}

/**
 * Conditions
 */
export interface CoC7eConditions {
  unconscious: boolean;
  dying: boolean;
  majorWound: boolean;
  temporaryInsanity: boolean;
  indefiniteInsanity: boolean;
}

/**
 * Spells and mythos knowledge
 */
export interface CoC7eSpellsAndMythos {
  cthulhuMythos: number;
  spells: string[];
}

/**
 * Possession
 */
export interface CoC7ePossession {
  name: string;
  notes: string;
}

/**
 * Wealth information
 */
export interface CoC7eWealth {
  spendingLevel: string;
  cash: number;
  assets: string;
  notes: string;
}

/**
 * Backstory details
 */
export interface CoC7eBackstory {
  description: string;
  personalDescription: string;
  ideology: string;
  significantPeople: string;
  meaningfulLocations: string;
  treasuredPossessions: string;
  traits: string;
  injuriesAndScars: string;
  phobiasAndManias: string;
  arcaneTomesAndSpells: string;
  encountersWithStrangeEntities: string;
}

/**
 * Contact
 */
export interface CoC7eContact {
  name: string;
  role: string;
  notes: string;
}

/**
 * Character appearance
 */
export interface CoC7eAppearance {
  age: string | number;
  height: string;
  weight: string;
  eyes: string;
  hair: string;
  skin: string;
}

/**
 * Complete Call of Cthulhu 7e character data
 */
export interface CoC7eCharacterData {
  investigatorName: string;
  playerName: string;
  occupation: string;
  era: string;
  age: string | number;
  sex: string;
  residence: string;
  birthplace: string;
  characteristics: CoC7eCharacteristics;
  derivedStats: CoC7eDerivedStats;
  skills: CoC7eSkills;
  combat: CoC7eCombat;
  conditions: CoC7eConditions;
  pulpTalents: string[];
  spellsAndMythos: CoC7eSpellsAndMythos;
  possessions: CoC7ePossession[];
  wealth: CoC7eWealth;
  backstory: CoC7eBackstory;
  contacts: CoC7eContact[];
  appearance: CoC7eAppearance;
  notes: string;
}
