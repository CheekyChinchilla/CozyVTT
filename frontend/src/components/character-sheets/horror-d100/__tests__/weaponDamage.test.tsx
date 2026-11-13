/**
 * A Horror d100 weapon on the read-only sheet rolls its damage with the
 * damage modifier, and shows the value of the skill it names. Damage the dice
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

it('rolls dm as the damage modifier and reads the skill it names', () => {
  const onRoll = vi.fn();
  render(
    <WeaponsList
      weapons={[{ name: 'Fist', skill: 'Brawl', skillValue: 25, damage: '1D3+dm', range: 'Short', attacks: 1 }]}
      damageModifier="+1D4"
      skills={{ brawl: { value: 55, experienceCheck: false } }}
      onRoll={onRoll}
    />
  );
  expect(screen.getByText('55%')).toBeInTheDocument();
  fireEvent.click(screen.getByText('1D3+dm'));
  expect(onRoll).toHaveBeenCalledWith('1D3+1D4', 'Fist Damage');
});

// A weapon typed on the sheet before it was rebuilt wrote the modifier as DB.
it('rolls DB as the damage modifier too, and drops either for a character with none', () => {
  const onRoll = vi.fn();
  const weapons = [
    { name: 'Club', skill: 'Brawl', skillValue: 25, damage: '1d6+DB', range: 'Short', attacks: 1 },
    { name: 'Fist', skill: 'Brawl', skillValue: 25, damage: '1D3+dm', range: 'Short', attacks: 1 },
  ];
  const { rerender } = render(<WeaponsList weapons={weapons} damageModifier="-1D4" onRoll={onRoll} />);
  fireEvent.click(screen.getByText('1d6+DB'));
  expect(onRoll).toHaveBeenLastCalledWith('1d6-1D4', 'Club Damage');
  rerender(<WeaponsList weapons={weapons} damageModifier="None" onRoll={onRoll} />);
  fireEvent.click(screen.getByText('1d6+DB'));
  expect(onRoll).toHaveBeenLastCalledWith('1d6', 'Club Damage');
  fireEvent.click(screen.getByText('1D3+dm'));
  expect(onRoll).toHaveBeenLastCalledWith('1D3', 'Fist Damage');
});

it('shows damage the dice cannot read as no roll, and hands a click on it to the table to say why', () => {
  const onRoll = vi.fn();
  render(
    <WeaponsList
      weapons={[{ name: 'Rock', skill: 'Throw', skillValue: 20, damage: '1d4+half DB', range: 'STR/5 ft', attacks: 1 }]}
      damageModifier="+1D4"
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
      weapons={[{ name: 'Knife', skill: 'Brawl', skillValue: 25, damage: '1d4+', range: 'Short', attacks: 1 }]}
      damageModifier="None"
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
        { name: 'Fist', skill: 'Brawl', skillValue: 25, damage: '1D3+dm', range: 'Short', attacks: 1 },
        { name: 'Whip', skill: 'Whip', skillValue: 15, damage: '1d3', range: '10 ft', attacks: 1 },
      ]}
      skills={{ brawl: { value: 55, experienceCheck: false } }}
      editable
      onChange={vi.fn()}
    />
  );
  expect(screen.getByText('Rolls at 55%, the sheet\'s Brawl')).toBeInTheDocument();
  expect(screen.queryByText(/the sheet's Whip/)).not.toBeInTheDocument();
});

const combatSkills = {
  brawl: { value: 55, experienceCheck: false },
  firearm: [
    { specialty: 'Handgun', value: 45, experienceCheck: false },
    { specialty: 'Rifle', value: 35, experienceCheck: false },
    { specialty: 'Shotgun', value: 30, experienceCheck: false },
  ],
};

// Before it was rebuilt the sheet printed these rows as "Fighting (Brawl)"
// and "Firearms (Handgun)", and a weapon may still be stored naming them so.
it('reads a weapon stored with the skill names the sheet used to print', () => {
  render(
    <WeaponsList
      weapons={[
        { name: 'Fist', skill: 'Fighting (Brawl)', skillValue: 25, damage: '1d3+DB', range: 'Short', attacks: 1 },
        { name: 'Revolver', skill: 'Firearms (Handgun)', skillValue: 20, damage: '1d8', range: '15 m', attacks: 1 },
      ]}
      skills={combatSkills}
      onRoll={vi.fn()}
    />
  );
  expect(screen.getByText('55%')).toBeInTheDocument();
  expect(screen.getByText('45%')).toBeInTheDocument();
});

it('reads a weapon naming its skill as the sheet now prints it', () => {
  render(
    <WeaponsList
      weapons={[
        { name: 'Revolver', skill: 'Firearm (Handgun)', skillValue: 20, damage: '1d8', range: '15 m', attacks: 1 },
        { name: 'Rifle', skill: 'Firearm (Rifle)', skillValue: 25, damage: '2d6', range: '110 m', attacks: 1 },
        { name: 'Shotgun', skill: 'Firearm (Shotgun)', skillValue: 25, damage: '4d6', range: '10 m', attacks: 1 },
      ]}
      skills={combatSkills}
      onRoll={vi.fn()}
    />
  );
  expect(screen.getByText('45%')).toBeInTheDocument();
  expect(screen.getByText('35%')).toBeInTheDocument();
  expect(screen.getByText('30%')).toBeInTheDocument();
});

// The roll menu offers the same: a weapon with no value of its own rolls at
// the skill it names, and one that names no skill the sheet has rolls nothing.
it('rolls a weapon stored with no skill value at the skill it names, and offers no roll where the sheet has no such skill', () => {
  const onRoll = vi.fn();
  render(
    <WeaponsList
      weapons={[{ name: 'Fist', skill: 'Brawl', damage: '1D3' }, { name: 'Net', skill: 'Trawling', damage: '1D2' }]}
      skills={{ brawl: { value: 55, experienceCheck: false } }}
      onRoll={onRoll}
    />
  );
  fireEvent.click(screen.getByText('Fist'));
  expect(onRoll).toHaveBeenLastCalledWith('1d100', 'Fist (Brawl) — target: 55%');
  onRoll.mockClear();
  fireEvent.click(screen.getByText('Net'));
  expect(onRoll).not.toHaveBeenCalled();
  expect(screen.getByText('Net').closest('tr')).not.toHaveAttribute('title');
  expect(screen.getByText('Net').closest('tr')).toHaveTextContent('NetTrawling—1D2');
  // Its damage still rolls.
  fireEvent.click(screen.getByText('1D2'));
  expect(onRoll).toHaveBeenCalledWith('1D2', 'Net Damage');
});

it('adds a weapon that names Brawl, with the damage of a fist', () => {
  const onChange = vi.fn();
  render(<WeaponsList weapons={[]} editable onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add Weapon' }));
  expect(onChange).toHaveBeenCalledWith([
    { name: 'New Weapon', skill: 'Brawl', skillValue: 25, damage: '1D3+dm', range: 'Short', attacks: 1, ammo: null, malfunction: null, notes: '' },
  ]);
});

it('shows a weapon\'s notes under its row, and takes them in the editor', () => {
  const weapons = [
    { name: 'Boat hook', skill: 'Brawl', skillValue: 25, damage: '1D6', notes: 'Borrowed from the Marguerite' },
    { name: 'Knife', skill: 'Brawl', skillValue: 25, damage: '1D4' },
  ];
  const { unmount } = render(<WeaponsList weapons={weapons} />);
  expect(screen.getByText('Borrowed from the Marguerite')).toBeInTheDocument();
  expect(screen.getAllByRole('row')).toHaveLength(1 + 3);
  unmount();

  const onChange = vi.fn();
  render(<WeaponsList weapons={weapons} editable onChange={onChange} />);
  expect(screen.getByLabelText('Notes on weapon 1')).toHaveValue('Borrowed from the Marguerite');
  fireEvent.change(screen.getByLabelText('Notes on weapon 2'), { target: { value: 'Blunt' } });
  expect(onChange).toHaveBeenCalledWith([weapons[0], { ...weapons[1], notes: 'Blunt' }]);
});
