/**
 * The D&D 5e editor stops adding to a list where the server stops keeping it.
 *
 * The server refuses a sheet whose inventory, attacks, hit dice, spells,
 * features or cantrips hold more than the list limit, so an add button past it
 * made a sheet that could be filled in and not saved. Here the limit is two, so
 * two rows fill a list.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import { dnd5eCharacter } from './dnd5eFixture';
import { DND5E_ATTACK_DAMAGE_ROLLS_MAX, DND5E_CUSTOM_SKILLS_MAX } from '@/constants/sheetLimits';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/constants/sheetLimits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/constants/sheetLimits')>()),
  SHEET_LIST_MAX: 2,
}));

const FULL = /This list is full: a sheet holds at most 2 entries here/;

function open(tab: RegExp, overrides: Record<string, unknown>) {
  render(<DnD5eCharacterEditor character={dnd5eCharacter(overrides)} onSave={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: tab }));
}

const item = (name: string) => ({ name, quantity: 1, weight: 0, notes: '', equippable: false, equipped: false, requiresAttunement: false, attuned: false, value: 0 });
const attack = (name: string) => ({ name, attackBonus: 0, damageRoll: '1d6', damageType: 'slashing', range: 5, properties: [], notes: '' });
const spell = (name: string) => ({ level: 1, name, prepared: false, ritual: false, concentration: false });
const die = { class: 'Fighter', die: 'd10', maximum: 1, remaining: 1 };

describe.each([
  ['inventory', /Inventory/, '+ Add Item', () => ({ inventory: [item('Rope'), item('Torch')] }), () => ({ inventory: [item('Rope')] })],
  ['attacks', /Combat/, '+ Add Attack', () => ({ attacks: [attack('Sword'), attack('Dagger')] }), () => ({ attacks: [attack('Sword')] })],
  ['hit dice', /Combat/, '+ Add Hit Die', () => ({ hitDice: [die, die] }), () => ({ hitDice: [die] })],
  ['spells', /Spells/, '+ Add Spell', () => ({ spellcasting: { ability: 'Wisdom', spells: [spell('Shield'), spell('Bless')] } }), () => ({ spellcasting: { ability: 'Wisdom', spells: [spell('Shield')] } })],
  ['features', /Features/, '+ Add Feature', () => ({ featuresAndTraits: [{ name: 'Second Wind' }, { name: 'Action Surge' }] }), () => ({ featuresAndTraits: [{ name: 'Second Wind' }] })],
])('the %s list', (_list, tab, button, full, room) => {
  it('turns its add button off at the limit, and says why', () => {
    open(tab, full());
    expect(screen.getByRole('button', { name: button })).toBeDisabled();
    expect(screen.getByText(FULL)).toBeInTheDocument();
  });

  it('keeps its add button on while there is room', () => {
    open(tab, room());
    expect(screen.getByRole('button', { name: button })).toBeEnabled();
    expect(screen.queryByText(FULL)).toBeNull();
  });
});

describe('the cantrips box', () => {
  const cantrips = () => screen.getByPlaceholderText(/Enter cantrips separated by commas/) as HTMLTextAreaElement;

  it('does not take a third cantrip, and says why', () => {
    open(/Spells/, { spellcasting: { ability: 'Wisdom', cantrips: ['Light', 'Mage Hand'] } });
    fireEvent.change(cantrips(), { target: { value: 'Light, Mage Hand, Guidance' } });

    expect(cantrips().value).toBe('Light, Mage Hand');
    expect(screen.getByText(FULL)).toBeInTheDocument();
  });

  it('takes a comma after the last cantrip that fits, and a change that keeps the count', () => {
    open(/Spells/, { spellcasting: { ability: 'Wisdom', cantrips: ['Light', 'Mage Hand'] } });
    fireEvent.change(cantrips(), { target: { value: 'Light, Mage Hand, ' } });
    expect(cantrips().value).toBe('Light, Mage Hand, ');
    fireEvent.change(cantrips(), { target: { value: 'Light, Guidance, ' } });
    expect(cantrips().value).toBe('Light, Guidance, ');
  });

  it('can be shortened when a stored sheet is over the limit', () => {
    open(/Spells/, { spellcasting: { ability: 'Wisdom', cantrips: ['Light', 'Mage Hand', 'Guidance', 'Thaumaturgy'] } });
    expect(cantrips().value).toBe('Light, Mage Hand, Guidance, Thaumaturgy');

    fireEvent.change(cantrips(), { target: { value: 'Light, Mage Hand, Guidance' } });
    expect(cantrips().value).toBe('Light, Mage Hand, Guidance');
    fireEvent.change(cantrips(), { target: { value: 'Light, Mage Hand, Guidance, Druidcraft' } });
    expect(cantrips().value).toBe('Light, Mage Hand, Guidance');
  });
});

describe('the lists with a lower limit of their own', () => {
  const custom = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Tool ${i}`, ability: 'dexterity', proficient: true }));
  const damage = (n: number) => Array.from({ length: n }, () => ({ label: 'Two hands', damageRoll: '1d8', damageType: 'slashing' }));
  const fullAt = (max: number) => new RegExp(`This list is full: a sheet holds at most ${max} entries here`);

  it('turns + Add Skill off at the custom skill limit', () => {
    open(/Stats/, { customSkills: custom(DND5E_CUSTOM_SKILLS_MAX) });
    expect(screen.getByRole('button', { name: '+ Add Skill' })).toBeDisabled();
    expect(screen.getByText(fullAt(DND5E_CUSTOM_SKILLS_MAX))).toBeInTheDocument();
  });

  it('keeps + Add Skill on below it', () => {
    open(/Stats/, { customSkills: custom(DND5E_CUSTOM_SKILLS_MAX - 1) });
    expect(screen.getByRole('button', { name: '+ Add Skill' })).toBeEnabled();
  });

  it('turns + Add Damage Roll off at the limit for that attack alone', () => {
    open(/Combat/, { attacks: [{ ...attack('Spear'), additionalDamage: damage(DND5E_ATTACK_DAMAGE_ROLLS_MAX) }, attack('Dagger')] });
    const [spear, dagger] = screen.getAllByRole('button', { name: '+ Add Damage Roll' });
    expect(spear).toBeDisabled();
    expect(dagger).toBeEnabled();
    expect(screen.getByText(fullAt(DND5E_ATTACK_DAMAGE_ROLLS_MAX))).toBeInTheDocument();
  });
});
