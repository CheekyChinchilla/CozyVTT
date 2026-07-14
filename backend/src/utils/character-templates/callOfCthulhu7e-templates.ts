/**
 * Call of Cthulhu 7e Character Templates
 * Provides blank and example character templates for quick character creation
 * Character Management
 */

import { GameSystem } from '@prisma/client';

export interface CharacterTemplate {
  name: string;
  description: string;
  gameSystem: GameSystem;
  data: any;
}

/**
 * Blank Call of Cthulhu 7e character template with minimal required fields
 */
export const coc7eBlankTemplate: CharacterTemplate = {
  name: 'Blank Call of Cthulhu 7e Character',
  description: 'A blank investigator sheet for Call of Cthulhu 7th Edition',
  gameSystem: GameSystem.CALL_OF_CTHULHU_7E,
  data: {
    investigatorName: 'Blank Investigator',
    occupation: 'Investigator',
    era: 'Modern',
    characteristics: {
      STR: { regular: 50, half: 25, fifth: 10 },
      CON: { regular: 50, half: 25, fifth: 10 },
      SIZ: { regular: 50, half: 25, fifth: 10 },
      DEX: { regular: 50, half: 25, fifth: 10 },
      APP: { regular: 50, half: 25, fifth: 10 },
      INT: { regular: 50, half: 25, fifth: 10 },
      POW: { regular: 50, half: 25, fifth: 10 },
      EDU: { regular: 50, half: 25, fifth: 10 },
    },
    derivedStats: {
      hp: { maximum: 10, current: 10, formula: '(CON+SIZ)/10', majorWoundThreshold: 1 },
      magicPoints: { maximum: 10, current: 10, formula: 'POW/5' },
      sanity: { starting: 50, current: 50, maximum: 99, formula: 'POW' },
      luck: { score: 50, notes: '' },
      moveRate: 8,
      build: 0,
      damageBonus: '0',
      dodge: { value: 25, formula: 'DEX/2', improvementChecked: false },
    },
    skills: {
      accounting: { baseValue: 5, currentValue: 5, improvementChecked: false },
      anthropology: { baseValue: 1, currentValue: 1, improvementChecked: false },
      appraise: { baseValue: 5, currentValue: 5, improvementChecked: false },
      archaeology: { baseValue: 1, currentValue: 1, improvementChecked: false },
      libraryUse: { baseValue: 20, currentValue: 20, improvementChecked: false },
      occult: { baseValue: 5, currentValue: 5, improvementChecked: false },
      spotHidden: { baseValue: 25, currentValue: 25, improvementChecked: false },
      listen: { baseValue: 20, currentValue: 20, improvementChecked: false },
      naturalWorld: { baseValue: 10, currentValue: 10, improvementChecked: false },
      charm: { baseValue: 15, currentValue: 15, improvementChecked: false },
      fastTalk: { baseValue: 5, currentValue: 5, improvementChecked: false },
      intimidate: { baseValue: 15, currentValue: 15, improvementChecked: false },
      persuade: { baseValue: 10, currentValue: 10, improvementChecked: false },
      psychology: { baseValue: 10, currentValue: 10, improvementChecked: false },
      climb: { baseValue: 20, currentValue: 20, improvementChecked: false },
      jump: { baseValue: 20, currentValue: 20, improvementChecked: false },
      swim: { baseValue: 20, currentValue: 20, improvementChecked: false },
      throw: { baseValue: 20, currentValue: 20, improvementChecked: false },
      stealth: { baseValue: 20, currentValue: 20, improvementChecked: false },
      dodge: { baseValue: 25, currentValue: 25, improvementChecked: false },
      fighting: {
        brawl: { baseValue: 25, currentValue: 25, improvementChecked: false },
        custom: [],
      },
      firearms: {
        handgun: { baseValue: 20, currentValue: 20, improvementChecked: false },
        rifle: { baseValue: 25, currentValue: 25, improvementChecked: false },
        shotgun: { baseValue: 25, currentValue: 25, improvementChecked: false },
        custom: [],
      },
      artCraft: { baseValue: 5, currentValue: 5, improvementChecked: false, specialization: null },
      disguise: { baseValue: 5, currentValue: 5, improvementChecked: false },
      driveAuto: { baseValue: 20, currentValue: 20, improvementChecked: false },
      firstAid: { baseValue: 30, currentValue: 30, improvementChecked: false },
      locksmith: { baseValue: 1, currentValue: 1, improvementChecked: false },
      mechanicalRepair: { baseValue: 10, currentValue: 10, improvementChecked: false },
      electricalRepair: { baseValue: 10, currentValue: 10, improvementChecked: false },
      operateHeavyMachinery: { baseValue: 1, currentValue: 1, improvementChecked: false },
      sleightOfHand: { baseValue: 10, currentValue: 10, improvementChecked: false },
      pilot: { baseValue: 1, currentValue: 1, improvementChecked: false, specialization: null },
      history: { baseValue: 5, currentValue: 5, improvementChecked: false },
      languageOwn: { baseValue: 50, currentValue: 50, improvementChecked: false, language: 'English' },
      languageOther: [],
      law: { baseValue: 5, currentValue: 5, improvementChecked: false },
      medicine: { baseValue: 1, currentValue: 1, improvementChecked: false },
      science: [],
      navigate: { baseValue: 10, currentValue: 10, improvementChecked: false },
      survival: { baseValue: 10, currentValue: 10, improvementChecked: false, specialization: null },
      track: { baseValue: 10, currentValue: 10, improvementChecked: false },
      creditRating: { baseValue: 0, currentValue: 0, improvementChecked: false },
      cthulhuMythos: { baseValue: 0, currentValue: 0, improvementChecked: false },
      psychoanalysis: { baseValue: 1, currentValue: 1, improvementChecked: false },
      ride: { baseValue: 5, currentValue: 5, improvementChecked: false },
      customSkills: [],
    },
    combat: {
      weapons: [],
    },
    wealth: {
      spendingLevel: 'Average',
      cash: 0,
      assets: '',
      notes: '',
    },
    possessions: [],
    backstory: {
      description: '',
      personalDescription: '',
      ideology: '',
      significantPeople: '',
      meaningfulLocations: '',
      treasuredPossessions: '',
      traits: '',
      injuriesAndScars: '',
      phobiasAndManias: '',
      arcaneTomesAndSpells: '',
      encountersWithStrangeEntities: '',
    },
  },
};

/**
 * Example Private Investigator template
 */
export const coc7ePrivateInvestigatorTemplate: CharacterTemplate = {
  name: 'Private Investigator',
  description: 'A gritty private eye, ready to take on cases',
  gameSystem: GameSystem.CALL_OF_CTHULHU_7E,
  data: {
    investigatorName: 'Jack Morrison',
    player: '',
    occupation: 'Private Investigator',
    era: 'Modern',
    age: 35,
    sex: 'Male',
    residence: 'Boston, Massachusetts',
    birthplace: 'New York City',
    characteristics: {
      STR: { regular: 60, half: 30, fifth: 12 },
      CON: { regular: 60, half: 30, fifth: 12 },
      SIZ: { regular: 65, half: 33, fifth: 13 },
      DEX: { regular: 70, half: 35, fifth: 14 },
      APP: { regular: 55, half: 28, fifth: 11 },
      INT: { regular: 70, half: 35, fifth: 14 },
      POW: { regular: 60, half: 30, fifth: 12 },
      EDU: { regular: 65, half: 33, fifth: 13 },
    },
    derivedStats: {
      hp: { maximum: 13, current: 13, formula: '(CON+SIZ)/10', majorWoundThreshold: 1 },
      magicPoints: { maximum: 12, current: 12, formula: 'POW/5' },
      sanity: { starting: 60, current: 60, maximum: 99, formula: 'POW' },
      luck: { score: 55, notes: '' },
      moveRate: 8,
      build: 1,
      damageBonus: '+1d4',
      dodge: { value: 35, formula: 'DEX/2', improvementChecked: false },
    },
    skills: {
      accounting: { baseValue: 5, currentValue: 10, improvementChecked: false },
      anthropology: { baseValue: 1, currentValue: 1, improvementChecked: false },
      appraise: { baseValue: 5, currentValue: 5, improvementChecked: false },
      archaeology: { baseValue: 1, currentValue: 1, improvementChecked: false },
      libraryUse: { baseValue: 20, currentValue: 50, improvementChecked: false },
      occult: { baseValue: 5, currentValue: 5, improvementChecked: false },
      spotHidden: { baseValue: 25, currentValue: 65, improvementChecked: false },
      listen: { baseValue: 20, currentValue: 50, improvementChecked: false },
      naturalWorld: { baseValue: 10, currentValue: 10, improvementChecked: false },
      charm: { baseValue: 15, currentValue: 40, improvementChecked: false },
      fastTalk: { baseValue: 5, currentValue: 40, improvementChecked: false },
      intimidate: { baseValue: 15, currentValue: 45, improvementChecked: false },
      persuade: { baseValue: 10, currentValue: 50, improvementChecked: false },
      psychology: { baseValue: 10, currentValue: 55, improvementChecked: false },
      climb: { baseValue: 20, currentValue: 20, improvementChecked: false },
      jump: { baseValue: 20, currentValue: 20, improvementChecked: false },
      swim: { baseValue: 20, currentValue: 20, improvementChecked: false },
      throw: { baseValue: 20, currentValue: 20, improvementChecked: false },
      stealth: { baseValue: 20, currentValue: 45, improvementChecked: false },
      dodge: { baseValue: 35, currentValue: 35, improvementChecked: false },
      fighting: {
        brawl: { baseValue: 25, currentValue: 50, improvementChecked: false },
        custom: [],
      },
      firearms: {
        handgun: { baseValue: 20, currentValue: 55, improvementChecked: false },
        rifle: { baseValue: 25, currentValue: 25, improvementChecked: false },
        shotgun: { baseValue: 25, currentValue: 25, improvementChecked: false },
        custom: [],
      },
      artCraft: { baseValue: 5, currentValue: 5, improvementChecked: false, specialization: null },
      disguise: { baseValue: 5, currentValue: 30, improvementChecked: false },
      driveAuto: { baseValue: 20, currentValue: 45, improvementChecked: false },
      firstAid: { baseValue: 30, currentValue: 30, improvementChecked: false },
      locksmith: { baseValue: 1, currentValue: 45, improvementChecked: false },
      mechanicalRepair: { baseValue: 10, currentValue: 10, improvementChecked: false },
      electricalRepair: { baseValue: 10, currentValue: 10, improvementChecked: false },
      operateHeavyMachinery: { baseValue: 1, currentValue: 1, improvementChecked: false },
      sleightOfHand: { baseValue: 10, currentValue: 30, improvementChecked: false },
      pilot: { baseValue: 1, currentValue: 1, improvementChecked: false, specialization: null },
      history: { baseValue: 5, currentValue: 5, improvementChecked: false },
      languageOwn: { baseValue: 65, currentValue: 65, improvementChecked: false, language: 'English' },
      languageOther: [],
      law: { baseValue: 5, currentValue: 40, improvementChecked: false },
      medicine: { baseValue: 1, currentValue: 1, improvementChecked: false },
      science: [],
      navigate: { baseValue: 10, currentValue: 10, improvementChecked: false },
      survival: { baseValue: 10, currentValue: 10, improvementChecked: false, specialization: null },
      track: { baseValue: 10, currentValue: 40, improvementChecked: false },
      creditRating: { baseValue: 0, currentValue: 30, improvementChecked: false },
      cthulhuMythos: { baseValue: 0, currentValue: 0, improvementChecked: false },
      psychoanalysis: { baseValue: 1, currentValue: 1, improvementChecked: false },
      ride: { baseValue: 5, currentValue: 5, improvementChecked: false },
      customSkills: [],
    },
    combat: {
      weapons: [
        {
          name: '.38 Revolver',
          skill: 'Firearms (Handgun)',
          skillValue: 55,
          damage: '1D10',
          range: '15 yards',
          attacks: 1,
          ammo: 18,
          malfunction: 100,
          notes: '6-round cylinder, spare ammo in pocket',
        },
        {
          name: 'Fists/Punch',
          skill: 'Fighting (Brawl)',
          skillValue: 50,
          damage: '1D3+1D4',
          range: 'Touch',
          attacks: 1,
          ammo: null,
          malfunction: null,
          notes: 'Damage includes damage bonus',
        },
      ],
    },
    wealth: {
      spendingLevel: 'Average',
      cash: 100,
      assets: 'Small office in downtown Boston, modest apartment, old car',
      notes: '',
    },
    possessions: [
      { name: 'Trench coat', notes: 'Signature look' },
      { name: 'Fedora hat', notes: 'Worn and weathered' },
      { name: 'Notepad and pencil', notes: 'For taking notes' },
      { name: 'Camera', notes: 'For surveillance photos' },
      { name: 'Flashlight', notes: 'Essential for night work' },
      { name: 'Lockpicks', notes: 'Questionably legal' },
    ],
    backstory: {
      description: 'A former police detective who left the force after a corruption scandal. Now works as a private investigator, taking cases the cops won\'t touch.',
      personalDescription: 'A rugged man in his mid-30s with dark hair and a perpetual five o\'clock shadow. Usually dressed in a rumpled suit and trench coat. Has a scar above his left eyebrow from a bar fight years ago.',
      ideology: 'Everyone has secrets, and the truth is rarely what it seems. Trust your instincts and keep your gun loaded.',
      significantPeople: 'Former partner Frank O\'Brien (still on the force), ex-wife Mary, informant "Fingers" McGee',
      meaningfulLocations: 'The precinct where he used to work, his small office on Main Street, Murphy\'s Bar where he meets informants',
      treasuredPossessions: 'His father\'s police badge, a photograph of his ex-wife, his lucky lighter',
      traits: 'Cynical but with a hidden sense of justice. Doesn\'t trust easily but loyal to those who earn it. Has a dry sense of humor and drinks too much coffee.',
      injuriesAndScars: 'Scar above left eyebrow from a bar fight. Old bullet wound in left shoulder. Occasional back pain from being thrown down stairs.',
      phobiasAndManias: 'Mild claustrophobia from being trapped in a locked room during a case. Compulsive about locking doors.',
      arcaneTomesAndSpells: 'None yet, but has heard whispers of strange books in certain cases.',
      encountersWithStrangeEntities: 'Once saw something he couldn\'t explain in an abandoned warehouse. Still has nightmares about it.',
    },
  },
};

/**
 * Get all available Call of Cthulhu 7e templates
 */
export function getCoC7eTemplates(): CharacterTemplate[] {
  return [coc7eBlankTemplate, coc7ePrivateInvestigatorTemplate];
}

/**
 * Get a specific Call of Cthulhu 7e template by name
 */
export function getCoC7eTemplate(templateName?: string): CharacterTemplate {
  if (!templateName || templateName === 'blank') {
    return coc7eBlankTemplate;
  }

  if (templateName === 'privateinvestigator' || templateName === 'pi') {
    return coc7ePrivateInvestigatorTemplate;
  }

  return coc7eBlankTemplate;
}
