/**
 * A Pathfinder 2e strike's damage on the read-only sheet is offered as a roll
 * only when the dice parser rolls it, as the Roll... picker offers it. Damage
 * it cannot roll, such as "1d8+4 S", is shown as text that does not look like
 * a roll: its own title gives the parser's reason, in place of the strike's
 * "Click: roll", and a click on it rolls nothing, neither the damage nor the
 * strike around it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StrikesList } from '../components/StrikesList';

/** The element whose title the browser shows for this one, its own or the nearest above it. */
const shownTitle = (element: HTMLElement) => element.closest('[title]')?.getAttribute('title');

describe("a strike's damage on the sheet", () => {
  it('rolls damage the dice can roll', () => {
    const onRollDamage = vi.fn();
    render(
      <StrikesList
        strikes={[{ name: 'Longsword', type: 'melee', attackBonus: 7, damageRoll: '1d8+4', damageType: 'slashing' }]}
        onRollStrike={vi.fn()}
        onRollDamage={onRollDamage}
      />
    );
    fireEvent.click(screen.getByText('1d8+4'));
    expect(onRollDamage).toHaveBeenCalledWith('1d8+4', 'Longsword Damage');
  });

  it('offers no roll for damage the dice cannot roll', () => {
    const onRollStrike = vi.fn();
    const onRollDamage = vi.fn();
    render(
      <StrikesList
        strikes={[
          { name: 'Longsword', type: 'melee', attackBonus: 7, damageRoll: '1d8+4 S' },
          // Every character is a dice character, but the parser refuses it.
          { name: 'Dagger', type: 'melee', attackBonus: 7, damageRoll: '1d4+' },
        ]}
        onRollStrike={onRollStrike}
        onRollDamage={onRollDamage}
      />
    );
    for (const [text, reason] of [
      ['1d8+4 S', 'Invalid dice expression: Missing an operator between "4" and "s"'],
      ['1d4+', 'Invalid dice expression: Failed to evaluate expression'],
    ]) {
      const damage = screen.getByText(text);
      fireEvent.click(damage);
      expect(onRollDamage).not.toHaveBeenCalled();
      expect(shownTitle(damage)).toBe(reason);
      expect(damage.parentElement).toHaveClass('cursor-default');
    }
    expect(onRollStrike).not.toHaveBeenCalled();
  });

  it('does not light the strike up while the pointer is on damage that does not roll', () => {
    render(
      <StrikesList
        strikes={[{ name: 'Longsword', type: 'melee', attackBonus: 7, damageRoll: '1d8+4 S' }]}
        onRollStrike={vi.fn()}
        onRollDamage={vi.fn()}
      />
    );
    const damage = screen.getByText('1d8+4 S').parentElement as HTMLElement;
    expect(damage).toHaveAttribute('data-not-a-roll');
    const row = damage.closest('[data-roll]') as HTMLElement;
    expect(row.className).toContain('hover:not-has-[[data-not-a-roll]:hover]:bg-accent/10');
    expect(row.className).not.toMatch(/(^|\s)hover:bg-accent\/10/);
    expect(row.querySelector('svg.lucide-dices')?.getAttribute('class')).toContain('group-hover:not-group-has-[[data-not-a-roll]:hover]:opacity-60');
  });
});
