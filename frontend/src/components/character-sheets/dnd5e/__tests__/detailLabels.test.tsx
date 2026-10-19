/**
 * Every box in the D&D 5e editor is named by its label.
 *
 * Most labels were not tied to their boxes, so a screen reader announced a box
 * by its placeholder, or by nothing: Proficiency Bonus, Armor Class, the hit
 * points, an attack's bonus and damage, an item's quantity and weight, the
 * coins and the whole Biography tab.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import { dnd5eCharacter } from './dnd5eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const sheet = {
  customSkills: [{ name: "Thieves' Tools", ability: 'dexterity', proficient: true }],
  attacks: [{ name: 'Spear', attackBonus: 2, damageRoll: '1d6', damageType: 'piercing', range: 20, additionalDamage: [{ label: 'Two hands', damageRoll: '1d8', damageType: 'piercing' }] }],
  spellcasting: { ability: 'Wisdom', cantrips: [], spells: [{ level: 1, name: 'Bless', prepared: false, ritual: false, concentration: false }] },
};

function open() {
  render(<DnD5eCharacterEditor character={dnd5eCharacter(sheet)} onSave={vi.fn()} onCancel={vi.fn()} />);
}

describe('the character details', () => {
  it('names the Alignment and Background boxes by their labels', () => {
    open();
    expect(screen.getByLabelText('Alignment')).toHaveValue('Neutral');
    expect(screen.getByLabelText('Background')).toHaveValue('Soldier');
  });
});

describe.each([
  ['Stats & Skills', /Stats/, [
    'Character name', 'Level', 'Race', 'Class', 'Experience Points', 'Proficiency Bonus',
    "Name of skill 1", "Other bonus to Thieves' Tools",
  ]],
  ['Combat', /Combat/, [
    'Armor Class', 'Initiative', 'Speed (ft)', 'Maximum hit points', 'Current hit points', 'Temporary hit points',
    'Death save success 1', 'Death save failure 3',
    'Name of attack 1', 'Attack Bonus', 'Damage Roll', 'Damage Type', 'Range (ft)', 'Notes',
    'When damage roll 1 applies', 'Damage roll 1', 'Damage type of roll 1',
  ]],
  ['Spells', /Spells/, ['Spell Save DC', 'Spell Attack Bonus', 'Cantrips', 'Level of spell 1', 'Name of spell 1']],
  ['Inventory', /Inventory/, [
    'Copper (CP)', 'Platinum (PP)', 'Name of item 1', 'Quantity', 'Weight (lb)', 'Value (gp)', 'Notes',
  ]],
  ['Features', /Features/, ['Armor', 'Weapons', 'Tools', 'Languages', 'Additional Features & Traits']],
  ['Biography', /Biography/, [
    'Age', 'Height', 'Weight', 'Eyes', 'Skin', 'Hair', 'Personality Traits', 'Ideals', 'Bonds', 'Flaws',
    'Backstory', 'Name', 'Description', 'Treasure & Other Notes',
  ]],
])('the %s tab', (_tab, tab, labels) => {
  it.each(labels)('names the %s box', (label) => {
    open();
    fireEvent.click(screen.getByRole('button', { name: tab }));
    expect(screen.getAllByLabelText(label, { exact: true }).length).toBeGreaterThan(0);
  });
});
