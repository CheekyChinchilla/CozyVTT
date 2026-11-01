/**
 * A Call of Cthulhu weapon on the read-only sheet rolls its damage with the
 * damage bonus, and shows the value of the skill it names. Damage the dice
 * cannot read is shown and not offered as a roll: its own title gives the
 * parser's reason, in place of the weapon's "Click to roll", and a click on
 * it never rolls the weapon's skill. The click hands the damage to the
 * table, which says why it cannot roll it and sends nothing (useTableRoll).
 */
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WeaponsList } from '../components/WeaponsList';

/** The title the browser shows for this element, its own or the nearest above it. */
const shownTitle = (element: HTMLElement) => element.closest('[title]')?.getAttribute('title');

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

it('shows damage the dice cannot read as no roll, and hands a click on it to the table to say why', () => {
  const onRoll = vi.fn();
  render(
    <WeaponsList
      weapons={[{ name: 'Rock', skill: 'Throw', skillValue: 20, damage: '1d4+half DB', range: 'STR/5 ft', attacks: 1 }]}
      damageBonus="+1d4"
      onRoll={onRoll}
    />
  );
  const damage = screen.getByText('1d4+half DB');
  const cell = damage.closest('td') as HTMLElement;
  expect(shownTitle(damage)).toBe('Invalid dice expression: Missing an operator between "half" and "db"');
  expect(cell).toHaveClass('cursor-default');
  expect(cell).toHaveAttribute('data-not-a-roll');
  // The weapon's row does not light up, nor show its dice, while the pointer is on it.
  const row = cell.closest('tr') as HTMLElement;
  expect(row.className).toContain('hover:not-has-[[data-not-a-roll]:hover]:bg-ink/5');
  expect(row.className).not.toMatch(/(^|\s)hover:bg-ink\/5/);
  expect(row.querySelector('svg.lucide-dices')?.getAttribute('class')).toContain('group-hover:not-group-has-[[data-not-a-roll]:hover]:opacity-60');

  fireEvent.click(damage);
  // Never the skill: the click on the damage once fell through to the row,
  // which rolls the weapon's skill.
  expect(onRoll).toHaveBeenCalledTimes(1);
  expect(onRoll).toHaveBeenCalledWith('1d4+half DB', 'Rock Damage');
});

// Its characters are all dice characters, but the parser refuses it.
it('shows damage the parser refuses as no roll too', () => {
  const onRoll = vi.fn();
  render(
    <WeaponsList
      weapons={[{ name: 'Knife', skill: 'Brawl', skillValue: 25, damage: '1d4+', range: 'Touch', attacks: 1 }]}
      damageBonus="0"
      onRoll={onRoll}
    />
  );
  const damage = screen.getByText('1d4+');
  expect(shownTitle(damage)).toBe('Invalid dice expression: Failed to evaluate expression');
  fireEvent.click(damage);
  expect(onRoll).toHaveBeenCalledWith('1d4+', 'Knife Damage');
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
