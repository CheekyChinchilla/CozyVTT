/**
 * The D&D 5e editor holds a sheet to what the server stores.
 *
 * It let a player clear Race or Class, lower Armor Class or maximum hit points
 * to 0, type any custom skill bonus, give an attack more properties or longer
 * damage text than a sheet keeps, and push the spell save DC below 1. The
 * server refused each save, and when the box was on another tab the player was
 * left looking for it. The boxes now stop where the server does, and Save
 * names what typing cannot prevent and opens the tab it is on.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import { DND5E_SHEET, dnd5eCharacter } from './dnd5eFixture';
import { DND5E_WEAPON_PROPERTIES_MAX, SHEET_SHORT_TEXT_MAX } from '@/constants/sheetLimits';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const stats = DND5E_SHEET.stats as Record<string, { score: number; modifier: number }>;

function open(overrides: Record<string, unknown> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<DnD5eCharacterEditor character={dnd5eCharacter(overrides)} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
}
const tab = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const pressSave = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));
const shownTab = () => screen.getAllByRole('button').find((b) => b.getAttribute('aria-current') === 'page')?.textContent;
const spear = { name: 'Spear', attackBonus: 2, damageRoll: '1d6', damageType: 'piercing', range: 20, properties: [] as string[] };

describe('the boxes', () => {
  it('stop Armor Class and maximum hit points at 1', () => {
    open();
    tab(/Combat/);
    expect(screen.getByLabelText('Armor Class')).toHaveAttribute('min', '1');
    expect(screen.getByLabelText('Maximum hit points')).toHaveAttribute('min', '1');
  });

  it('hold Race and Class to the length a sheet keeps', () => {
    open();
    expect(screen.getByLabelText('Race')).toHaveAttribute('maxLength', String(SHEET_SHORT_TEXT_MAX));
    expect(screen.getByLabelText('Class')).toHaveAttribute('maxLength', String(SHEET_SHORT_TEXT_MAX));
  });

  it('hold a custom skill\'s other bonus to -30 to +30', () => {
    open({ customSkills: [{ name: 'Cartography', ability: 'wisdom', proficient: true }] });
    const box = screen.getByLabelText('Other bonus to Cartography');
    expect([box.getAttribute('min'), box.getAttribute('max')]).toEqual(['-30', '30']);
  });

  it('hold an attack\'s further damage lines to the lengths a sheet keeps', () => {
    open({ attacks: [{ ...spear, additionalDamage: [{ label: '', damageRoll: '', damageType: '' }] }] });
    tab(/Combat/);
    expect(screen.getByLabelText('When damage roll 1 applies')).toHaveAttribute('maxLength', '60');
    expect(screen.getByLabelText('Damage roll 1')).toHaveAttribute('maxLength', '60');
    expect(screen.getByLabelText('Damage type of roll 1')).toHaveAttribute('maxLength', '40');
  });

  it('stop adding properties to an attack that has as many as a sheet keeps', () => {
    const properties = Array.from({ length: DND5E_WEAPON_PROPERTIES_MAX }, (_, i) => `rune ${i}`);
    open({ attacks: [{ ...spear, properties }] });
    tab(/Combat/);
    expect(screen.getByRole('button', { name: 'finesse' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    // One already on can still be taken off.
    expect(screen.getByRole('button', { name: 'rune 0 ×' })).toBeEnabled();
  });

  it('keep the spell save DC other bonus from taking the DC below 1', () => {
    // Wisdom 1 (-5) and proficiency +2: 8 + 2 - 5 = 5, so -4 is the lowest.
    open({ stats: { ...stats, wisdom: { score: 1, modifier: -5 } }, spellcasting: { ability: 'Wisdom', spellSaveDCOtherBonus: 0 } });
    tab(/Spells/);
    expect(screen.getByLabelText('Spell save DC other bonus')).toHaveAttribute('min', '-4');
  });
});

describe('saving', () => {
  it('names a blank Race and Class, and saves nothing', () => {
    const onSave = open({ race: '', class: ' ' });
    pressSave();

    expect(screen.getByRole('alert')).toHaveTextContent('Race is required');
    expect(screen.getByRole('alert')).toHaveTextContent('Class is required');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('opens the tab a refused box is on', () => {
    const onSave = open({ hp: { maximum: 0, current: 0, temporary: 0 } });
    pressSave();

    expect(shownTab()).toContain('Combat');
    expect(screen.getAllByText('Maximum hit points must be at least 1').length).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves a sheet stored without hit points as it was', async () => {
    const onSave = open({ hp: undefined });
    pressSave();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('hp');
  });

  it('names an attack whose name was typed and cleared', () => {
    const onSave = open({ attacks: [spear] });
    tab(/Combat/);
    fireEvent.change(screen.getByLabelText('Name of attack 1'), { target: { value: '' } });
    tab(/Stats/);
    pressSave();

    expect(shownTab()).toContain('Combat');
    expect(screen.getAllByText('Name this attack, or remove it').length).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('names an item and a spell with no name', () => {
    open({
      inventory: [{ name: '', quantity: 1 }],
      spellcasting: { ability: 'Wisdom', spells: [{ level: 1, name: '', prepared: false, ritual: false, concentration: false }] },
    });
    pressSave();

    expect(screen.getByRole('alert')).toHaveTextContent('Name this item, or remove it');
    expect(screen.getByRole('alert')).toHaveTextContent('Name this spell, or remove it');
  });

  it('names a spell save DC below 1', () => {
    const onSave = open({ stats: { ...stats, wisdom: { score: 1, modifier: -5 } }, spellcasting: { ability: 'Wisdom', spellSaveDCOtherBonus: -10 } });
    pressSave();

    expect(shownTab()).toContain('Spells');
    expect(screen.getAllByText('The spell save DC must be at least 1. Raise its Other bonus.').length).toBeGreaterThan(0);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('stops naming a box once it is changed', () => {
    open({ race: '' });
    pressSave();
    fireEvent.change(screen.getByLabelText('Race'), { target: { value: 'Dwarf' } });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('goes through once everything is filled in', async () => {
    const onSave = open({ race: '' });
    pressSave();
    fireEvent.change(screen.getByLabelText('Race'), { target: { value: 'Dwarf' } });
    pressSave();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });
});
