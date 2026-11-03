/**
 * A D&D 5e attack's damage on the read-only sheet is offered as a roll only
 * when the dice parser rolls it, as the Roll... picker offers it. Damage it
 * cannot roll, such as "1d8 slashing", is shown as text that does not look
 * like a roll: its own title gives the parser's reason, in place of the
 * attack's "Click: roll", and a click on it never rolls the attack around it.
 * The click hands the damage to the table, which says why it cannot roll it
 * and sends nothing (useTableRoll).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttacksList } from '../components/AttacksList';
import { getCharacterRolls } from '@/utils/characterRolls';
import { dnd5eCharacter } from './dnd5eFixture';

/** The element whose title the browser shows for this one, its own or the nearest above it. */
const shownTitle = (element: HTMLElement) => element.closest('[title]')?.getAttribute('title');

describe("an attack's damage on the sheet", () => {
  it('rolls damage the dice can roll', () => {
    const onRollDamage = vi.fn();
    render(
      <AttacksList
        attacks={[{ name: 'Longsword', attackBonus: 5, damageRoll: '1d8+3', damageType: 'slashing' }]}
        onRollAttack={vi.fn()}
        onRollDamage={onRollDamage}
      />
    );
    fireEvent.click(screen.getByText('1d8+3'));
    expect(onRollDamage).toHaveBeenCalledWith('1d8+3', 'Longsword Damage');
  });

  it('shows damage the dice cannot roll as no roll, and hands a click on it to the table to say why', () => {
    const onRollAttack = vi.fn();
    const onRollDamage = vi.fn();
    render(
      <AttacksList
        attacks={[
          { name: 'Longsword', attackBonus: 5, damageRoll: '1d8 slashing' },
          // Every character is a dice character, but the parser refuses it.
          { name: 'Dagger', attackBonus: 5, damageRoll: '1d4+' },
        ]}
        onRollAttack={onRollAttack}
        onRollDamage={onRollDamage}
      />
    );
    for (const [text, reason] of [
      ['1d8 slashing', 'Invalid dice expression: Missing an operator between "1d8" and "slashing"'],
      ['1d4+', 'Invalid dice expression: Failed to evaluate expression'],
    ]) {
      const damage = screen.getByText(text);
      fireEvent.click(damage);
      expect(onRollDamage).toHaveBeenLastCalledWith(text, `${text === '1d4+' ? 'Dagger' : 'Longsword'} Damage`);
      expect(shownTitle(damage)).toBe(reason);
      expect(damage.parentElement).toHaveClass('cursor-default');
    }
    expect(onRollAttack).not.toHaveBeenCalled();
  });

  it('does not light the attack up while the pointer is on damage that does not roll', () => {
    render(
      <AttacksList
        attacks={[{ name: 'Longsword', attackBonus: 5, damageRoll: '1d8 slashing' }]}
        onRollAttack={vi.fn()}
        onRollDamage={vi.fn()}
      />
    );
    const damage = screen.getByText('1d8 slashing').parentElement as HTMLElement;
    expect(damage).toHaveAttribute('data-not-a-roll');
    const row = damage.closest('[data-roll]') as HTMLElement;
    expect(row.className).toContain('hover:not-has-[[data-not-a-roll]:hover]:bg-accent/10');
    expect(row.className).not.toMatch(/(^|\s)hover:bg-accent\/10/);
    expect(row.querySelector('svg.lucide-dices')?.getAttribute('class')).toContain('group-hover:not-group-has-[[data-not-a-roll]:hover]:opacity-60');
  });

  it('offers a further damage line as a roll only when the dice can roll it', () => {
    const onRollAttack = vi.fn();
    const onRollDamage = vi.fn();
    render(
      <AttacksList
        attacks={[{
          name: 'Longsword',
          attackBonus: 5,
          damageRoll: '1d8+3',
          additionalDamage: [
            { label: 'Two-handed', damageRoll: '1d10+3' },
            { label: 'Flame Tongue', damageRoll: '2d6 fire' },
          ],
        }]}
        onRollAttack={onRollAttack}
        onRollDamage={onRollDamage}
      />
    );
    fireEvent.click(screen.getByText('1d10+3'));
    expect(onRollDamage).toHaveBeenCalledTimes(1);
    expect(onRollDamage).toHaveBeenCalledWith('1d10+3', 'Longsword Damage (Two-handed)');

    const unrollable = screen.getByText('2d6 fire');
    fireEvent.click(unrollable);
    expect(onRollDamage).toHaveBeenLastCalledWith('2d6 fire', 'Longsword Damage (Flame Tongue)');
    expect(onRollAttack).not.toHaveBeenCalled();
    expect(shownTitle(unrollable)).toBe('Invalid dice expression: Missing an operator between "2d6" and "fire"');
    expect(unrollable.parentElement).toHaveClass('cursor-default');
    expect(unrollable.parentElement).toHaveAttribute('data-not-a-roll');
  });
});

describe('a damage roll\'s name', () => {
  // The sheet named a further damage line "Longsword — Two-handed" and the
  // Roll... picker "Longsword Damage (Two-handed)", so the Dice panel named
  // one roll two ways. Both take it from rollPurposes.ts now.
  it('is the one the Roll... picker gives the same roll', () => {
    const attack = { name: 'Longsword', attackBonus: 5, damageRoll: '1d8+3', additionalDamage: [{ label: 'Two-handed', damageRoll: '1d10+3' }] };
    const onRollAttack = vi.fn();
    const onRollDamage = vi.fn();
    render(<AttacksList attacks={[attack]} onRollAttack={onRollAttack} onRollDamage={onRollDamage} />);
    fireEvent.click(screen.getByText('1d8+3'));
    fireEvent.click(screen.getByText('1d10+3'));
    fireEvent.click(screen.getByText('+5'));
    const sheet = dnd5eCharacter({ attacks: [attack] });
    const picker = getCharacterRolls(sheet.gameSystem, sheet.data).combat;
    const named = (expression: string) => picker.find((roll) => roll.expression === expression)?.purpose;
    expect(onRollDamage.mock.calls).toEqual([['1d8+3', named('1d8+3')], ['1d10+3', named('1d10+3')]]);
    expect(onRollAttack.mock.calls[0]?.[1]).toBe(named('1d20+5'));
  });
});
