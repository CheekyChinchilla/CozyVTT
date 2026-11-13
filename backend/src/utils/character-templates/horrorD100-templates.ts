// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * Horror d100 character templates: a blank sheet and one ready-made example,
 * for quick character creation, in the sheet rebuilt on the open d100 rules
 * (validators/game-systems/horrorD100Sheet.schema.ts). Their professions are
 * from the open d100 rules' list of professions.
 */

import { GameSystem } from '@prisma/client';
import { HORROR_D100_BLASPHEMOUS_LORE, HORROR_D100_HUMAN_MOVE, horrorD100NewSkills } from '../rules/horrorD100';
import type { CharacterTemplate } from './types';

/** A rating the template gives a skill, with no experience check. */
const rated = (value: number) => ({ value, experienceCheck: false });

/** A specialty of a skill, such as Firearm (Handgun), at a rating. */
const specialty = (name: string, value: number) => ({ specialty: name, ...rated(value) });

/**
 * Blank Horror d100 character template: each characteristic at 10, every
 * skill at its base chance, and the derived attributes worked out from those
 * (open d100 rules, pp. 14 to 16).
 */
export const horrorD100BlankTemplate: CharacterTemplate = {
  name: 'Blank Horror d100 Character',
  description: 'A blank character sheet for Horror d100',
  gameSystem: GameSystem.HORROR_D100,
  data: {
    characterName: 'New Character',
    profession: 'Student',
    era: 'Modern',
    characteristics: { STR: 10, CON: 10, SIZ: 10, INT: 10, POW: 10, DEX: 10, CHA: 10, EDU: 10 },
    // Hit points are CON plus SIZ, halved and rounded up; power points are
    // POW; Sanity starts at five times POW; MOV is 10 for a human.
    hitPoints: { maximum: 10, current: 10 },
    powerPoints: { maximum: 10, current: 10 },
    sanity: { starting: 50, maximum: 99, current: 50 },
    move: HORROR_D100_HUMAN_MOVE,
    skills: {
      ...horrorD100NewSkills({ DEX: 10, INT: 10, POW: 10, EDU: 10 }),
      // Knowledge (Blasphemous Lore) starts at 0 and lowers maximum Sanity
      // as it rises (open d100 rules, p. 43, Knowledge Specialties).
      knowledge: [specialty(HORROR_D100_BLASPHEMOUS_LORE, 0)],
    },
    weapons: [],
    armor: [],
    possessions: [],
    wealth: {
      level: 'Average',
      cash: 0,
      assets: '',
      notes: '',
    },
    story: [],
  },
};

/**
 * Example private detective template. Detective is a profession of the open
 * d100 rules (p. 22, Detective), and the character is a starting one at the
 * normal power level, with the skill points the rules give (open d100 rules,
 * p. 8, Step Seven: Profession and Skills; p. 9, Education (Option)):
 *
 * - The professional pool is 20 times EDU, 260 points for EDU 13. It goes to
 *   the profession's six skills (Firearm (Handgun) +30, Knowledge (Law) +30,
 *   Listen +25, Persuade +30, Spot +35 and Research +25) and four of those
 *   it lets a player choose (Brawl +20, Insight +35, Stealth +15 and
 *   Track +15).
 * - The personal pool is 10 times INT, 140 points for INT 14, for any skill:
 *   Disguise +24, Dodge +1, Fast Talk +30, Fine Manipulation +30, Sleight of
 *   Hand +15, Status +10, Drive (Automobile) +25 and Knowledge
 *   (Accounting) +5.
 *
 * Each rating is the skill's base chance plus its points, and none is past
 * the 75% a starting skill may reach. `exampleContent.test.ts` holds the
 * totals to the pools.
 */
export const horrorD100PrivateInvestigatorTemplate: CharacterTemplate = {
  name: 'Private Detective',
  description: 'A gritty private eye, ready to take on cases',
  gameSystem: GameSystem.HORROR_D100,
  data: {
    characterName: 'Leo Marchbank',
    profession: 'Detective',
    era: 'Modern',
    age: '35',
    sex: 'Male',
    residence: 'Boston, Massachusetts',
    birthplace: 'New York City',
    characteristics: { STR: 12, CON: 12, SIZ: 13, INT: 14, POW: 12, DEX: 14, CHA: 11, EDU: 13 },
    // CON 12 plus SIZ 13 is 25, halved and rounded up.
    hitPoints: { maximum: 13, current: 13 },
    powerPoints: { maximum: 12, current: 12 },
    sanity: { starting: 60, maximum: 99, current: 60 },
    move: HORROR_D100_HUMAN_MOVE,
    skills: {
      ...horrorD100NewSkills({ DEX: 14, INT: 14, POW: 12, EDU: 13 }),
      brawl: rated(45),
      disguise: rated(25),
      dodge: rated(29),
      fastTalk: rated(35),
      fineManipulation: rated(35),
      insight: rated(40),
      listen: rated(50),
      persuade: rated(45),
      research: rated(50),
      sleightOfHand: rated(20),
      spot: rated(60),
      status: rated(25),
      stealth: rated(25),
      track: rated(25),
      languageOwn: { language: 'English', ...rated(70) },
      drive: [specialty('Automobile', 45)],
      firearm: [specialty('Handgun', 50)],
      knowledge: [specialty('Law', 35), specialty('Accounting', 10), specialty(HORROR_D100_BLASPHEMOUS_LORE, 0)],
    },
    // The open d100 rules' medium revolver (p. 202, Modern Missile Weapons:
    // 1D8, one attack, range 25, six rounds, malfunction 00) and fist (p. 197,
    // Primitive Melee Weapons: Brawl, 1D3+dm, range Short). "+dm" is where the
    // damage modifier is added (p. 190, Weapons). The table lists the revolver
    // under the Revolver specialty; the sheet rolls it at Firearm (Handgun),
    // the skill the Detective profession names.
    weapons: [
      {
        name: 'Medium Revolver (.38)',
        skill: 'Firearm (Handgun)',
        skillValue: 50,
        damage: '1D8',
        range: '25 meters',
        attacks: 1,
        ammo: 6,
        malfunction: 100,
        notes: '6-round cylinder, 12 spare rounds in pocket',
      },
      {
        name: 'Fist',
        skill: 'Brawl',
        skillValue: 45,
        damage: '1D3+dm',
        range: 'Short',
        attacks: 1,
        ammo: null,
        malfunction: null,
        notes: '',
      },
    ],
    armor: [],
    distinctiveFeatures: ['A scar above his left eyebrow'],
    wealth: {
      level: 'Average',
      cash: 100,
      assets: 'Small office in downtown Boston, modest apartment, old car',
      notes: '',
    },
    // Equipment the open d100 rules name: its kits, lockpicks and light sources.
    possessions: [
      { name: 'Criminology Kit', notes: 'Fingerprint powder and evidence bags' },
      { name: 'Disguise Kit', notes: 'For following someone unseen' },
      { name: 'Flashlight', notes: 'Essential for night work' },
      { name: 'Lockpicks', notes: 'Questionably legal' },
      { name: 'First Aid Kit', notes: 'Bandages and iodine' },
    ],
    // A few notes with titles written for this character: a player names
    // each note as they like.
    story: [
      { title: 'How he got here', text: 'A former police detective who left the force after a corruption scandal. Now works for himself, taking the cases the cops won\'t touch.' },
      { title: 'What he is like', text: 'Mid-30s, dark hair, a rumpled suit and a trench coat. Cynical, with a sense of justice he keeps hidden; slow to trust and loyal to those who earn it. Drinks too much coffee.' },
      { title: 'Who he can call', text: 'Frank O\'Brien, his old partner, still on the force. "Fingers" McGee, an informant, most nights at Murphy\'s Bar.' },
      { title: 'The warehouse job', text: 'He once saw something he couldn\'t explain in an abandoned warehouse. He still has nightmares about it, and checks every lock twice.' },
    ],
  },
};

/**
 * Get all available Horror d100 templates
 */
export function getHorrorD100Templates(): CharacterTemplate[] {
  return [horrorD100BlankTemplate, horrorD100PrivateInvestigatorTemplate];
}

/**
 * Get a specific Horror d100 template by name
 */
export function getHorrorD100Template(templateName?: string): CharacterTemplate {
  if (!templateName || templateName === 'blank') {
    return horrorD100BlankTemplate;
  }

  if (templateName === 'privateinvestigator' || templateName === 'pi') {
    return horrorD100PrivateInvestigatorTemplate;
  }

  return horrorD100BlankTemplate;
}
