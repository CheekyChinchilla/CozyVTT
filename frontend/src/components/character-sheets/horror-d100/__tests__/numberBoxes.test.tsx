/**
 * The Horror d100 sheet's number boxes can be cleared and retyped.
 *
 * Characteristics, skills, Sanity and weapon skill values committed
 * `parseInt(...) || 0` on every keystroke, so clearing a box to type 65 set
 * it to 0 first: everything worked out from it was worked out for 0 in
 * between, and a Sanity cleared mid-edit stayed at 0. An ammunition count or
 * malfunction number of 0 showed as empty. A characteristic, a skill and a
 * weapon's skill value run to the highest rating a sheet stores.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharacteristicBlock } from '../components/CharacteristicBlock';
import { SkillsList } from '../components/SkillsList';
import { SanityTracker } from '../components/SanityTracker';
import { WeaponsList } from '../components/WeaponsList';
import { ArmorList } from '../components/ArmorList';
import { HORROR_D100_VALUE_MAX } from '@/constants/sheetLimits';

/** Clear a box and type a number into it, as a player would. */
function retype(box: HTMLElement, value: string) {
  fireEvent.change(box, { target: { value: '' } });
  fireEvent.change(box, { target: { value } });
}

describe('a characteristic', () => {
  it('goes from one value to another without 0 between', () => {
    const onChange = vi.fn();
    render(<CharacteristicBlock label="STR" value={10} roll="Effort" editable onChange={onChange} />);
    retype(screen.getByRole('spinbutton'), '15');
    expect(onChange.mock.calls).toEqual([[15]]);
  });

  it('takes up to the highest rating', () => {
    render(<CharacteristicBlock label="POW" value={10} roll="Luck" editable onChange={vi.fn()} />);
    expect(screen.getByRole('spinbutton')).toHaveAttribute('max', String(HORROR_D100_VALUE_MAX));
    expect(screen.getByRole('spinbutton')).toHaveAttribute('min', '0');
  });
});

describe('a skill', () => {
  it('goes from one value to another without 0 between, from 0 up', () => {
    const onChange = vi.fn();
    render(<SkillsList skills={{ listen: { value: 20, experienceCheck: false } }} editable onChange={onChange} />);
    const box = screen.getByRole('spinbutton');
    expect(box).toHaveAttribute('max', String(HORROR_D100_VALUE_MAX));
    expect(box).toHaveAttribute('min', '0');
    retype(box, '65');
    expect(onChange.mock.calls.map(([skills]) => skills.listen)).toEqual([{ value: 65, experienceCheck: false }]);
  });

  it('can be set below its base chance, and to 0', () => {
    const onChange = vi.fn();
    render(<SkillsList skills={{ climb: { value: 40, experienceCheck: true } }} editable onChange={onChange} />);
    const box = screen.getByRole('spinbutton');
    fireEvent.change(box, { target: { value: '0' } });
    fireEvent.blur(box);
    expect(box).toHaveValue(0);
    expect(onChange.mock.calls.length).toBeGreaterThan(0);
    for (const [skills] of onChange.mock.calls) expect(skills.climb).toEqual({ value: 0, experienceCheck: true });
  });
});

describe('Sanity', () => {
  it('goes from one value to another without 0 between', () => {
    const current = vi.fn();
    render(<SanityTracker current={60} starting={60} maximum={99} editable onChange={{ current, starting: vi.fn() }} />);
    retype(screen.getAllByRole('spinbutton')[0], '55');
    expect(current.mock.calls).toEqual([[55]]);
  });

  it('is not typed above its maximum', () => {
    const current = vi.fn();
    render(<SanityTracker current={40} starting={60} maximum={57} blasphemousLore={43} editable onChange={{ current, starting: vi.fn() }} />);
    fireEvent.change(screen.getByLabelText('Current Sanity'), { target: { value: '80' } });
    expect(current.mock.calls).toEqual([[57]]);
    expect(screen.getByText('(100 − 43 Blasphemous Lore)')).toBeInTheDocument();
  });
});

// Focus passing through a box is not an edit: it changes no stored value,
// one outside the box's own range included.
describe('a box that only loses focus', () => {
  const passThrough = (box: HTMLElement) => {
    fireEvent.focus(box);
    fireEvent.blur(box);
  };

  it('leaves current Sanity stored above the maximum as it is', () => {
    const current = vi.fn();
    render(<SanityTracker current={65} starting={70} maximum={60} editable onChange={{ current, starting: vi.fn() }} />);
    passThrough(screen.getByLabelText('Current Sanity'));
    expect(current).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Current Sanity')).toHaveValue(65);
    // Typing still stops at the maximum.
    fireEvent.change(screen.getByLabelText('Current Sanity'), { target: { value: '64' } });
    expect(current.mock.calls).toEqual([[60]]);
  });

  it('gives a weapon stored with no skill value and no attacks neither', () => {
    const onChange = vi.fn();
    render(<WeaponsList weapons={[{ name: 'Boat hook' }]} editable onChange={onChange} />);
    for (const box of screen.getAllByRole('spinbutton')) passThrough(box);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Attacks of weapon 1'), { target: { value: '2' } });
    expect(onChange.mock.calls).toEqual([[[{ name: 'Boat hook', attacks: 2 }]]]);
  });
});

describe('a weapon', () => {
  const pistol = { name: '.38 Revolver', skill: 'Handgun', skillValue: 40, damage: '1d10', range: '15 yards', attacks: 1, ammo: 0, malfunction: 0 };

  it('takes a skill value up to the highest rating without 0 between', () => {
    const onChange = vi.fn();
    render(<WeaponsList weapons={[pistol]} editable onChange={onChange} />);
    const value = screen.getByDisplayValue('40');
    expect(value).toHaveAttribute('max', String(HORROR_D100_VALUE_MAX));
    retype(value, '65');
    expect(onChange.mock.calls.map(([weapons]) => weapons[0].skillValue)).toEqual([65]);
  });

  it('shows an ammunition count and a malfunction number of 0', () => {
    render(<WeaponsList weapons={[pistol]} editable onChange={vi.fn()} />);
    expect(screen.getAllByDisplayValue('0')).toHaveLength(2);
  });
});

describe('a piece of armor', () => {
  it('keeps no armor value where it had none and the box is passed through', () => {
    const onChange = vi.fn();
    render(<ArmorList armor={[{ name: 'Coat' }]} editable onChange={onChange} />);
    const box = screen.getByLabelText('Armor value of armor 1');
    fireEvent.focus(box);
    fireEvent.blur(box);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: '2' } });
    expect(onChange.mock.calls).toEqual([[[{ name: 'Coat', armorValue: 2 }]]]);
  });
});
