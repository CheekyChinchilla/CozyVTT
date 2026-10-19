/**
 * The Call of Cthulhu sheet's number boxes can be cleared and retyped.
 *
 * Characteristics, skills, Sanity and weapon skill values committed
 * `parseInt(...) || 0` on every keystroke, so clearing a box to type 65 set
 * it to 0 first: hit points and the half and fifth columns were worked out
 * for 0 in between, and a Sanity cleared mid-edit stayed at 0. Each box also
 * stopped at 99 where a sheet stores 100, and an ammunition count or
 * malfunction number of 0 showed as empty.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CharacteristicBlock } from '../components/CharacteristicBlock';
import { SkillsList } from '../components/SkillsList';
import { SanityTracker } from '../components/SanityTracker';
import { WeaponsList } from '../components/WeaponsList';

/** Clear a box and type a number into it, as a player would. */
function retype(box: HTMLElement, value: string) {
  fireEvent.change(box, { target: { value: '' } });
  fireEvent.change(box, { target: { value } });
}

describe('a characteristic', () => {
  it('goes from one value to another without 0 between', () => {
    const onChange = vi.fn();
    render(<CharacteristicBlock label="STR" regular={50} half={25} fifth={10} editable onChange={onChange} />);
    retype(screen.getByRole('spinbutton'), '65');
    expect(onChange.mock.calls).toEqual([[65]]);
  });

  it('takes up to 100', () => {
    render(<CharacteristicBlock label="POW" regular={50} half={25} fifth={10} editable onChange={vi.fn()} />);
    expect(screen.getByRole('spinbutton')).toHaveAttribute('max', '100');
  });
});

describe('a skill', () => {
  it('goes from one value to another without 0 between', () => {
    const onChange = vi.fn();
    render(<SkillsList skills={{ listen: { baseValue: 20, currentValue: 20, improvementChecked: false } }} editable onChange={onChange} />);
    const box = screen.getByRole('spinbutton');
    expect(box).toHaveAttribute('max', '100');
    retype(box, '65');
    expect(onChange.mock.calls).toEqual([['listen', 'currentValue', 65]]);
  });
});

describe('Sanity', () => {
  it('goes from one value to another without 0 between', () => {
    const current = vi.fn();
    render(<SanityTracker current={60} starting={60} maximum={99} editable onChange={{ current, starting: vi.fn() }} />);
    retype(screen.getAllByRole('spinbutton')[0], '55');
    expect(current.mock.calls).toEqual([[55]]);
  });
});

describe('a weapon', () => {
  const pistol = { name: '.38 Revolver', skill: 'Handgun', skillValue: 40, damage: '1d10', range: '15 yards', attacks: 1, ammo: 0, malfunction: 0 };

  it('takes a skill value up to 100 without 0 between', () => {
    const onChange = vi.fn();
    render(<WeaponsList weapons={[pistol]} editable onChange={onChange} />);
    const value = screen.getByDisplayValue('40');
    expect(value).toHaveAttribute('max', '100');
    retype(value, '65');
    expect(onChange.mock.calls.map(([weapons]) => weapons[0].skillValue)).toEqual([65]);
  });

  it('shows an ammunition count and a malfunction number of 0', () => {
    render(<WeaponsList weapons={[pistol]} editable onChange={vi.fn()} />);
    expect(screen.getAllByDisplayValue('0')).toHaveLength(2);
  });
});
