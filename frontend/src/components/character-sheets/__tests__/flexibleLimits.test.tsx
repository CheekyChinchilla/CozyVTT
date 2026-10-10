/**
 * The Flexible editor's boxes stop at what the server stores.
 *
 * The server refuses a Flexible sheet with a title, stat name, list entry,
 * column name or cell over its limit, or a text section over 100,000
 * characters. A box that let the player type past that made a sheet they
 * could fill in and not save.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Character } from '@/types';
import { FlexibleCharacterSheetEdit } from '../flexible/FlexibleCharacterSheetEdit';
import { SHEET_LONG_TEXT_MAX, SHEET_NAME_MAX, SHEET_SHORT_TEXT_MAX } from '@/constants/sheetLimits';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const character = {
  id: 'flex-1', userId: 'user-1', name: 'Freeform', gameSystem: null, campaignId: null, tokenImageUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  data: {
    sections: [
      { id: 's1', title: 'Stats', type: 'stats', fields: [{ id: 'f1', name: 'Str', value: 10, modifier: 0 }] },
      { id: 's2', title: 'Kit', type: 'list', items: [{ id: 'i1', text: 'Rope', checked: false }] },
      { id: 's3', title: 'Story', type: 'text', value: '' },
      { id: 's4', title: 'Gear', type: 'table', columns: [{ id: 'c1', name: 'Item' }], rows: [{ id: 'r1', cells: { c1: 'Sword' } }] },
    ],
  },
} as unknown as Character;

describe('the Flexible editor', () => {
  it('stops each box at the length the server stores', () => {
    render(<FlexibleCharacterSheetEdit character={character} onSave={vi.fn()} onCancel={vi.fn()} />);

    for (const title of screen.getAllByPlaceholderText('Section title')) {
      expect(title).toHaveAttribute('maxLength', String(SHEET_NAME_MAX));
    }
    expect(screen.getByPlaceholderText('Stat name')).toHaveAttribute('maxLength', String(SHEET_NAME_MAX));
    expect(screen.getByPlaceholderText('Enter item text...')).toHaveAttribute('maxLength', String(SHEET_SHORT_TEXT_MAX));
    expect(screen.getByPlaceholderText('Column name')).toHaveAttribute('maxLength', String(SHEET_NAME_MAX));
    expect(screen.getByDisplayValue('Sword')).toHaveAttribute('maxLength', String(SHEET_SHORT_TEXT_MAX));
    expect(screen.getByPlaceholderText('Enter text content...')).toHaveAttribute('maxLength', String(SHEET_LONG_TEXT_MAX));
  });
});
