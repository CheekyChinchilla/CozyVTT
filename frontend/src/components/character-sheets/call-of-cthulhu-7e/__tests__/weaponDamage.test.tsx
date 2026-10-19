/**
 * A Call of Cthulhu weapon on the read-only sheet rolls its damage with the
 * damage bonus, and shows the value of the skill it names. Damage the dice
 * cannot read is shown and not offered as a roll.
 */
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WeaponsList } from '../components/WeaponsList';

it('rolls DB as the damage bonus and reads the skill it names', () => {
  const onRoll = vi.fn();
  render(
    <WeaponsList
      weapons={[{ name: 'Fist', skill: 'Brawl', skillValue: 25, damage: '1d3+DB', range: 'Touch', attacks: 1 }]}
      damageBonus="+1d4"
      skills={{ fighting: { brawl: { baseValue: 25, currentValue: 55, improvementChecked: false }, custom: [] } }}
      onRoll={onRoll}
    />
  );
  expect(screen.getByText('55%')).toBeInTheDocument();
  fireEvent.click(screen.getByText('1d3+DB'));
  expect(onRoll).toHaveBeenCalledWith('1d3+1d4', 'Fist Damage');
});

it('offers no roll for damage the dice cannot read', () => {
  const onRoll = vi.fn();
  render(
    <WeaponsList
      weapons={[{ name: 'Rock', skill: 'Throw', skillValue: 20, damage: '1d4+half DB', range: 'STR/5 ft', attacks: 1 }]}
      damageBonus="+1d4"
      onRoll={onRoll}
    />
  );
  const damage = screen.getByText('1d4+half DB');
  fireEvent.click(damage);
  expect(onRoll).not.toHaveBeenCalledWith(expect.anything(), 'Rock Damage');
  expect(damage.closest('td')).not.toHaveAttribute('title');
});

it('says in the editor which skill a weapon rolls at, where the sheet has it', () => {
  render(
    <WeaponsList
      weapons={[
        { name: 'Fist', skill: 'Brawl', skillValue: 25, damage: '1d3+DB', range: 'Touch', attacks: 1 },
        { name: 'Whip', skill: 'Whip', skillValue: 15, damage: '1d3', range: '10 ft', attacks: 1 },
      ]}
      skills={{ fighting: { brawl: { baseValue: 25, currentValue: 55, improvementChecked: false }, custom: [] } }}
      editable
      onChange={vi.fn()}
    />
  );
  expect(screen.getByText('Rolls at 55%, the sheet\'s Brawl')).toBeInTheDocument();
  expect(screen.queryByText(/the sheet's Whip/)).not.toBeInTheDocument();
});
