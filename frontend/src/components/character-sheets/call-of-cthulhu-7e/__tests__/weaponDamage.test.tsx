/**
 * A Call of Cthulhu weapon on the read-only sheet rolls its damage with the
 * damage bonus, and shows the value of the skill it names.
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
