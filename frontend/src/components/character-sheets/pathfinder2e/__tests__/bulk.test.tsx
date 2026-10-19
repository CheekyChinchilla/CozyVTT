/**
 * Pathfinder 2e Bulk on the sheet and in the editor.
 *
 * The editor and the read-only sheet each counted Bulk their own way, and both
 * were wrong: a Bulk typed in the box ("2") counted as nothing, a light item
 * counted as 0.1 with nothing rounded down, a character was marked encumbered
 * at exactly 5 + Strength where the rules say only above it, an item with no
 * quantity made the total NaN, one with no Bulk at all broke the sheet, and
 * the sheet showed the Bulk last stored, not what the inventory carries.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BulkTracker } from '../components/BulkTracker';
import { Pathfinder2eCharacterView } from '../Pathfinder2eCharacterView';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { pf2eCharacter } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const item = (name: string, fields: Record<string, unknown> = {}) => ({ name, quantity: 1, ...fields });

describe('the Bulk tracker', () => {
  it('leaves a character carrying exactly 5 + Strength unencumbered', () => {
    render(<BulkTracker inventory={[item('Chest', { bulk: 5 })]} strengthModifier={0} />);
    expect(screen.getByText('UNENCUMBERED')).toBeInTheDocument();
  });

  it('counts nine light items as no Bulk', () => {
    render(<BulkTracker inventory={[item('Chest', { bulk: 5 }), item('Dart', { bulk: 'L', quantity: 9 })]} strengthModifier={0} />);
    expect(screen.getByText('UNENCUMBERED')).toBeInTheDocument();
    expect(screen.getByText('5 and 9 L')).toBeInTheDocument();
  });

  it('marks a character encumbered above 5 + Strength', () => {
    render(<BulkTracker inventory={[item('Chest', { bulk: 6 })]} strengthModifier={0} />);
    expect(screen.getByText('ENCUMBERED')).toBeInTheDocument();
  });

  it('shows an item with no Bulk and no quantity', () => {
    render(<BulkTracker inventory={[{ name: 'Rope' }, { name: 'Shield', bulk: 1 }]} strengthModifier={0} />);
    expect(screen.getByText('Rope')).toBeInTheDocument();
    // The shield counts as one item.
    expect(screen.getByText('1', { selector: 'span.font-semibold' })).toBeInTheDocument();
  });
});

describe('the read-only sheet', () => {
  it('works Bulk out from the inventory and Strength', () => {
    render(
      <Pathfinder2eCharacterView
        character={pf2eCharacter({ inventory: [item('Chest', { bulk: '6' })], bulk: { current: 0, encumbered: 5, maximum: 10 } })}
      />
    );
    expect(screen.getByText('ENCUMBERED')).toBeInTheDocument();
  });
});

describe('the editor', () => {
  it('counts a Bulk typed in the box', async () => {
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    render(<Pathfinder2eCharacterEditor character={pf2eCharacter({ inventory: [item('Chest', { bulk: 'L' })] })} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Inventory/ }));
    fireEvent.change(screen.getByPlaceholderText('Bulk'), { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0][0] as unknown as { bulk: { current: number } }).bulk.current).toBe(2);
  });
});
