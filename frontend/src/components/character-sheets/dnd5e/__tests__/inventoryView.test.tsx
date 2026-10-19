/**
 * The D&D 5e sheet's inventory and attacks with a number left out.
 *
 * The schema lets an item go without a weight or a quantity and an attack
 * without a range. One item with no weight or quantity turned Total Weight
 * into 0.0 for the whole list, and the rows showed a bare "lb" or "ft".
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InventoryList } from '../components/InventoryList';
import { AttacksList } from '../components/AttacksList';

describe('the inventory', () => {
  it('counts an item with no weight as weighing nothing and one with no quantity as one', () => {
    render(
      <InventoryList
        inventory={[
          { name: 'Rope' },
          { name: 'Torch', weight: 1, quantity: 2 },
          { name: 'Bedroll', weight: 7 },
        ]}
      />
    );
    expect(screen.getByText('9.0 lb')).toBeInTheDocument();
  });

  it('shows a dash for a weight or quantity the item does not have', () => {
    render(<InventoryList inventory={[{ name: 'Rope' }]} />);
    const row = screen.getByText('Rope').closest('div.flex.items-center.justify-between') as HTMLElement;
    expect(row.textContent).not.toMatch(/(^|[^\d])lb/);
    expect(row.textContent).toContain('Qty—');
    expect(row.textContent).toContain('Wt—');
  });
});

describe('the attacks', () => {
  it('shows a dash for an attack with no range', () => {
    render(<AttacksList attacks={[{ name: 'Fist', attackBonus: 2, damageRoll: '1', damageType: 'bludgeoning' }]} />);
    const range = screen.getByText('Range').parentElement as HTMLElement;
    expect(range.textContent).toBe('Range—');
  });
});
