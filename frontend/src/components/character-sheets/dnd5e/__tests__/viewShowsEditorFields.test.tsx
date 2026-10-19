/**
 * The D&D 5e read-only sheet shows what the editor records.
 *
 * An item's value and the player's name were typed or filled in through the
 * editor and shown nowhere else, and the sheet gave no carrying capacity,
 * which the rules work out from Strength: 15 times the score, and twice that
 * to push, drag or lift (Basic Rules, "Lifting and Carrying").
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DnD5eCharacterView } from '../DnD5eCharacterView';
import { InventoryList } from '../components/InventoryList';
import { DND5E_SHEET, dnd5eCharacter } from './dnd5eFixture';

const stats = DND5E_SHEET.stats as Record<string, { score: number; modifier: number }>;

describe('the inventory', () => {
  it('shows an item\'s value', () => {
    render(<InventoryList inventory={[{ name: 'Silvered dagger', quantity: 1, weight: 1, value: 102.5 }]} />);
    const row = screen.getByText('Silvered dagger').closest('div.flex.items-center.justify-between') as HTMLElement;
    expect(row.textContent).toContain('Value102.5 gp');
  });

  it('shows the carrying capacity Strength gives', () => {
    render(<InventoryList inventory={[]} strengthScore={14} />);
    expect(screen.getByText(/Carrying capacity/)).toHaveTextContent('Carrying capacity: 210 lb (push, drag or lift 420 lb)');
  });
});

describe('the read-only sheet', () => {
  it('works the carrying capacity out from the character\'s Strength', () => {
    render(<DnD5eCharacterView character={dnd5eCharacter({ stats: { ...stats, strength: { score: 16, modifier: 3 } } })} />);
    fireEvent.click(screen.getByRole('button', { name: /Inventory/ }));
    expect(screen.getByText(/Carrying capacity/)).toHaveTextContent('240 lb');
  });

  it('names the player', () => {
    render(<DnD5eCharacterView character={dnd5eCharacter({ playerName: 'Robin' })} />);
    expect(screen.getByText('Player: Robin')).toBeInTheDocument();
  });
});
