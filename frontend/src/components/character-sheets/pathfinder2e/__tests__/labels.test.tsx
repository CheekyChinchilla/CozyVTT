/**
 * Every box in the Pathfinder 2e editor is named, and stops at the length a
 * sheet stores.
 *
 * Of its 83 controls, 7 were tied to a label: a screen reader announced the
 * rest by a placeholder or not at all, among them every proficiency rank. And
 * only the character's name stopped at the server's length, so a long paste
 * anywhere else made the save refused.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import { PF2E_BLANK_SHEET, pf2eCharacter } from './pf2eFixture';
import { SHEET_LONG_TEXT_MAX, SHEET_SHORT_TEXT_MAX } from '@/constants/sheetLimits';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const spellcasting = PF2E_BLANK_SHEET.spellcasting as Record<string, unknown>;
const spell = (name: string) => ({ name, rank: 1, prepared: false, ritual: false, heightened: false });

const sheet = {
  loreSkills: [{ name: 'Sailing Lore', attribute: 'intelligence', proficiencyRank: 'trained', itemBonus: 0, bonus: 0 }],
  strikes: [{ name: 'Fist', type: 'melee', attackBonus: 3, damageRoll: '1d4', damageType: 'bludgeoning', attributeModifier: 'strength', proficiencyRank: 'trained', itemBonus: 0, traits: [], range: null, notes: '' }],
  inventory: [{ name: 'Rope', quantity: 1, bulk: 'L', value: 0, notes: '' }],
  feats: { ancestryAndHeritage: [], class: [{ name: 'Power Attack', level: 1, description: '' }], skill: [], general: [], bonus: [] },
  spellcasting: {
    ...spellcasting,
    cantrips: [{ name: 'Light', rank: 1, prepared: false }],
    spells: [spell('Fear')],
    focusSpells: { focusPoints: { total: 1, current: 1 }, spells: [spell('Lay on Hands')] },
    innateSpells: [{ name: 'Detect Magic', frequency: 'at will' }],
    rituals: [{ name: 'Animate Object', rank: 2 }],
  },
};

function open(tab: RegExp) {
  render(<Pathfinder2eCharacterEditor character={pf2eCharacter(sheet)} onSave={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: tab }));
}

describe.each([
  ['Stats & Skills', /Stats/, [
    'Character name', 'Level', 'Class', 'Ancestry', 'Heritage', 'Background', 'Deity', 'Alignment', 'Experience Points', 'Hero Points',
    'Strength score', 'Charisma score', 'Proficiency in Fortitude saves', 'Item bonus to Will saves',
    'Proficiency in Perception', 'Item bonus to Perception', 'Senses',
    'Proficiency in Athletics', 'Item bonus to Athletics', 'Check penalty for Athletics',
    'Name of lore skill 1', 'Proficiency in lore skill 1', 'Item bonus to lore skill 1',
  ]],
  ['Combat', /Combat/, [
    'Proficiency in armor', 'DEX Cap', 'Armor item bonus', 'Key Attribute', 'Proficiency in Class DC', 'Initiative uses',
    'Land speed (ft)', 'Other speeds', 'Ancestry HP', 'Class HP per level', 'Current HP', 'Temporary HP',
    'Resistances', 'Immunities', 'Weaknesses', 'Dying', 'Wounded', 'Doomed', 'Conditions',
    'Proficiency with simple weapons', 'Proficiency in heavy armor',
    'Name of strike 1', 'Type of strike 1', 'Proficiency for strike 1', 'Attack bonus of strike 1',
    'Damage roll of strike 1', 'Damage type of strike 1', 'Range of strike 1', 'Traits of strike 1', 'Notes for strike 1',
  ]],
  ['Spells', /Spells/, [
    'Tradition', 'Type', 'Spellcasting Key Attribute', 'Spellcasting proficiency', 'Spell attack item bonus', 'Spell DC item bonus',
    'Name of cantrip 1', 'Rank 1 slots', 'Rank 1 slots used', 'Name of spell 1', 'Rank of spell 1',
    'Focus points left', 'Name of focus spell 1', 'Name of innate spell 1', 'Frequency of innate spell 1',
    'Name of ritual 1', 'Rank of ritual 1',
  ]],
  ['Inventory', /Inventory/, ['Platinum', 'Copper', 'Name of item 1', 'Quantity of item 1', 'Bulk of item 1', 'Value of item 1', 'Notes for item 1']],
  ['Feats & Features', /Feats/, ['Name of class feat 1', 'Level of class feat 1', 'Description of class feat 1']],
  ['Biography', /Biography/, [
    'Age', 'Height', 'Hair', 'Traits', 'Flaws', 'Languages', 'Backstory', 'Organization', 'Organization description', 'Notes', 'Treasure',
  ]],
])('the %s tab', (_name, tab, labels) => {
  it.each(labels)('names the %s box', (label) => {
    open(tab);
    expect(screen.getAllByLabelText(label, { exact: true }).length).toBeGreaterThan(0);
  });
});

describe('text lengths', () => {
  it('stop one-line boxes at the one-line limit', () => {
    open(/Stats/);
    for (const label of ['Class', 'Ancestry', 'Deity', 'Name of lore skill 1']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('maxLength', String(SHEET_SHORT_TEXT_MAX));
    }
  });

  it('stop paragraphs at the paragraph limit', () => {
    open(/Biography/);
    for (const label of ['Backstory', 'Notes', 'Traits']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('maxLength', String(SHEET_LONG_TEXT_MAX));
    }
  });
});
