/**
 * A Flexible sheet's editor with the keyboard and a screen reader.
 *
 * Its remove buttons (a section's, a stat's, a list entry's, a table row's
 * and column's) show only while the pointer is over their row, so a keyboard
 * reached them and showed nothing; they now show while they have the
 * keyboard's focus. A list entry's tick had no name or state; it is named
 * after its entry and says whether it is ticked.
 */
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Character } from '@/types';
import { FlexibleCharacterSheetEdit } from '../flexible/FlexibleCharacterSheetEdit';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const character = {
  id: 'flex-1', userId: 'user-1', name: 'Freeform', gameSystem: null, campaignId: null, tokenImageUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  data: {
    sections: [
      { id: 's1', title: 'Stats', type: 'stats', fields: [{ id: 'f1', name: 'Str', value: 10, modifier: 0 }] },
      { id: 's2', title: 'Kit', type: 'list', items: [{ id: 'i1', text: 'Rope', checked: true }, { id: 'i2', text: '', checked: false }] },
      { id: 's4', title: 'Gear', type: 'table', columns: [{ id: 'c1', name: 'Item' }, { id: 'c2', name: 'Weight' }], rows: [{ id: 'r1', cells: { c1: 'Sword' } }] },
    ],
  },
} as unknown as Character;

it('shows every remove button that waits for the pointer while it has the keyboard', () => {
  render(<FlexibleCharacterSheetEdit character={character} onSave={vi.fn()} onCancel={vi.fn()} />);
  const hidden = screen.getAllByRole('button').filter((b) => b.classList.contains('opacity-0'));
  // A section's three, a stat's, two list entries', a row's and two columns'.
  expect(hidden.length).toBeGreaterThanOrEqual(6);
  for (const button of hidden) expect(button.classList).toContain('focus-visible:opacity-100');
});

it('names a list entry\'s tick after its entry, and says whether it is ticked', () => {
  render(<FlexibleCharacterSheetEdit character={character} onSave={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Rope done' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Entry 2 done' })).toHaveAttribute('aria-pressed', 'false');
});
