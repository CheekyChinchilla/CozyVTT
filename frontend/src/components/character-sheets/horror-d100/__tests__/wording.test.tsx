/**
 * The Horror d100 sheet's words are CozyVTT's own or the open d100 rules'.
 *
 * Every label below is on the read-only sheet or in the editor, on one tab or
 * another, as the whole text of an element or of a box's name, placeholder or
 * title; and none of the words the sheet used before 1.7.0 is anywhere on
 * either, the Original values of a converted character included: the record
 * shown there holds every skill the old sheet had.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HorrorD100CharacterEditor } from '../HorrorD100CharacterEditor';
import { HorrorD100CharacterView } from '../HorrorD100CharacterView';
import { blankSkills, horrorD100Character } from './sheetFixture';
// The record of a sheet that held every skill of the sheet before 1.7.0, with everything a malformed
// sheet kept, as the server's conversion writes them: its own tests hold this file to that.
import convertedRecord from './convertedRecord.json';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const rated = (value: number) => ({ value, experienceCheck: false });

const character = () => horrorD100Character({
  characterName: 'Mara Quill',
  profession: 'Archivist',
  notes: 'Watch the cellar door',
  skills: blankSkills({
    knowledge: [{ specialty: 'Blasphemous Lore', ...rated(12) }, { specialty: 'Occult', ...rated(30) }],
    drive: [{ specialty: 'Automobile', ...rated(20) }],
    repair: [{ specialty: 'Electrical', ...rated(15) }, { specialty: 'Mechanical', ...rated(15) }],
    firearm: [{ specialty: 'Handgun', ...rated(20) }, { specialty: 'Rifle', ...rated(25) }],
    languageOther: [{ specialty: 'Latin', ...rated(20) }],
    own: [{ name: 'Charm', ...rated(45) }],
  }),
  sanity: { starting: 50, maximum: 88, current: 45 },
  spells: ['Ward of Ash'],
  weapons: [{ name: 'Lantern Hook', skill: 'Brawl', skillValue: 25, damage: '1D4+dm', range: 'Short', attacks: 1, ammo: null, malfunction: null, notes: '' }],
  armor: [{ name: 'Oilskin coat', armorValue: 1, notes: '' }],
  conditions: { majorWound: true },
  distinctiveFeatures: ['One gold earring'],
  story: [{ title: 'Background & History', text: 'Went to sea at fourteen.' }],
  contacts: [{ name: 'Edith Vane', role: 'Librarian', notes: '' }],
  appearance: { height: '1.7 m' },
  // JSON gives `from` as a number; the record's type takes the one value it holds.
  converted: { ...convertedRecord, from: 1 },
});

const ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt'];

/** Everything a person can read on the page: its text, and every box's name, placeholder and title. */
function readable(): string {
  const attributes = Array.from(document.querySelectorAll('*')).flatMap((element) =>
    ATTRIBUTES.map((name) => element.getAttribute(name) ?? '')
  );
  return [document.body.textContent ?? '', ...attributes].join('\n');
}

/**
 * Every whole label on the page: the text an element holds itself, outside
 * its child elements, and each box's name, placeholder and title.
 */
function labels(): string[] {
  return Array.from(document.querySelectorAll('*')).flatMap((element) => {
    const own = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    return [own, ...ATTRIBUTES.map((name) => element.getAttribute(name) ?? '')].filter(Boolean);
  });
}

/** What every tab shows, one after another: its readable text and its whole labels. */
function everyTab(): { text: string; labels: Set<string> } {
  const shown = new Set<string>();
  const text = ['Overview', 'Skills', 'Combat', 'Possessions', 'Story'].map((tab) => {
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${tab}$`) }));
    labels().forEach((label) => shown.add(label));
    return readable();
  }).join('\n');
  return { text, labels: shown };
}

/** The words the sheet used before, none of which it may show. */
const REPLACED = [
  /Investigator/i, /Keeper/i, /Occupation/i, /Myth/i, /Credit Rating/i, /Library Use/i, /Spot Hidden/i,
  /Psychoanalysis/i, /Magic Points/i, /\bMP\b/, /Damage Bonus/i, /\bDB:/, /Personal Description/i, /Ideology/i,
  /Significant People/i, /Meaningful Locations/i, /Treasured Possessions/i, /Injuries & Scars/i, /Phobias/i,
  /Arcane Tomes/i, /Strange Entities/i, /Bonus Die/i, /Penalty Die/i, /Drive Auto/i, /Operate Heavy Machinery/i,
  /Electrical Repair/i, /Mechanical Repair/i, /Fighting \(Brawl\)/, /Firearms \((?:Handgun|Rifle|Shotgun)\)/,
  // The rebuilt sheet dropped these with the numbers and boxes they named.
  /Indefinite/i, /Spending Level/i, /\bBuild\b/, /Move Rate/i, /Luck Score/i, /Improvement check/i, /Backstory/i,
  /\bHalf\b.*\bFifth\b/i, /½ \/ ⅕/, /Custom Skills/i, /Art\/Craft/i, /Locksmith/i, /Natural World/i,
  /Spells & Lore/i, /Fighting \(/, /Firearms \(/,
];

/** Skills the sheet lists by the open d100 rules' names, the same in the view and the editor's value boxes. */
const SKILLS = [
  'Status', 'Research', 'Spot', 'Psychotherapy', 'Dodge', 'Fast Talk', 'Fine Manipulation', 'Insight', 'Brawl', 'Grapple',
];

/** The specialties this character holds, as the read-only sheet names them. */
const SPECIALTIES = [
  'Knowledge (Blasphemous Lore)', 'Knowledge (Occult)', 'Drive (Automobile)', 'Repair (Electrical)', 'Repair (Mechanical)',
  'Firearm (Handgun)', 'Firearm (Rifle)', 'Language (Latin)', 'Language (Own)', 'Charm',
];

/** The headings and labels the view and the editor share. */
const SHARED = [
  'Characteristics', 'Sanity Points', 'Current Conditions', 'Major Wound', 'Dying', 'Unconscious', 'Temporary Insanity',
  'Effort', 'Stamina', 'Idea', 'Luck', 'Agility', 'Charm', 'Knowledge',
  'Skill Name', 'Base', 'Value', 'Combat', 'Communication', 'Manipulation', 'Mental', 'Perception', 'Physical', 'Own Skills',
  'Weapons', 'Armor', 'Contacts', 'Distinctive Features', 'Appearance', 'Spells', "GM's Notes", 'Original values',
  'Strength and size step', 'Kept as written',
];

describe('the read-only sheet', () => {
  it('shows each label whole', () => {
    render(<HorrorD100CharacterView character={character()} onEdit={vi.fn()} showOriginalValues />);
    const { labels: shown } = everyTab();
    const wanted = [
      'Power Points', 'Hit Points', 'Damage Modifier', 'Experience Bonus', 'MOV', 'Edit character', 'Derived Attributes',
      'Wealth Level', 'Background & History', 'Armor value', '(100 − 12 Blasphemous Lore)',
      ...SHARED, ...SKILLS, ...SPECIALTIES,
    ];
    expect(wanted.filter((label) => !shown.has(label))).toEqual([]);
  });

  it('shows none of the words the sheet used before it was rebuilt', () => {
    render(<HorrorD100CharacterView character={character()} onEdit={vi.fn()} showOriginalValues />);
    const { text } = everyTab();
    expect(REPLACED.filter((word) => word.test(text)).map(String)).toEqual([]);
  });

  it('names a character with no name or profession in its own words', () => {
    render(<HorrorD100CharacterView character={horrorD100Character({ characterName: '', profession: '' })} />);
    expect(screen.getByText('Unnamed Character')).toBeInTheDocument();
    expect(screen.getByText('No Profession')).toBeInTheDocument();
  });
});

describe('the editor', () => {
  it('shows each label whole', () => {
    render(<HorrorD100CharacterEditor character={character()} onSave={vi.fn()} onCancel={vi.fn()} />);
    const { labels: shown } = everyTab();
    const wanted = [
      'Character Name', 'Character name', 'Profession', 'Era', 'HP Max:', 'PP Max:', 'Current HP', 'Current PP',
      'Damage Modifier:', 'Experience Bonus:', 'Max SAN:', 'Major Wound:', '100 − Blasphemous Lore, at most 99',
      'Only you, as the GM, can see or change these.', 'Current Sanity', 'Starting Sanity', 'MOV', 'Wealth Level',
      'Story', 'Add Note', 'Add Weapon', 'Add Armor', 'Add Contact', 'Derived Attributes (Auto-Calculated)',
      'Experience check for Spot', 'Value of Knowledge (Blasphemous Lore)',
      ...SHARED, ...SKILLS, ...SPECIALTIES.map((name) => `Value of ${name}`),
    ];
    expect(wanted.filter((label) => !shown.has(label))).toEqual([]);
  });

  it('shows none of the words the sheet used before it was rebuilt', () => {
    render(<HorrorD100CharacterEditor character={character()} onSave={vi.fn()} onCancel={vi.fn()} />);
    const { text } = everyTab();
    expect(REPLACED.filter((word) => word.test(text)).map(String)).toEqual([]);
  });
});
