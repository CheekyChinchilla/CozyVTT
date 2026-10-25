/**
 * The Flexible editor's boxes stop at what the server stores.
 *
 * The server refuses a Flexible sheet with a title, stat name, list entry,
 * column name or cell over its limit, or a text section over 100,000
 * characters. A box that let the player type past that made a sheet they
 * could fill in and not save. Its add buttons likewise went on adding
 * sections, stats, list entries, columns and rows past the counts the server
 * keeps; each now turns off at its count and says why.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Character } from '@/types';
import type { ListSection, StatsSection, TableSection } from '@/types/flexible-character-sheet';
import { FlexibleCharacterSheetEdit } from '../flexible/FlexibleCharacterSheetEdit';
import { StatsEditor } from '../flexible/components/sections/StatsEditor';
import { ListEditor } from '../flexible/components/sections/ListEditor';
import { TableEditor } from '../flexible/components/sections/TableEditor';
import {
  FLEXIBLE_MAX_COLUMNS,
  FLEXIBLE_MAX_FIELDS,
  FLEXIBLE_MAX_ROWS,
  FLEXIBLE_MAX_SECTIONS,
  SHEET_LONG_TEXT_MAX,
  SHEET_NAME_MAX,
  SHEET_SHORT_TEXT_MAX,
} from '@/constants/sheetLimits';
import { listFullMessage } from '../ListLimitNote';

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

const many = <T,>(count: number, make: (index: number) => T): T[] => Array.from({ length: count }, (_, index) => make(index));
const full = (max: number) => screen.getByText(listFullMessage(max));

// A list or table at its limit draws 1,000 rows, which takes a second or two in
// jsdom and several on a busy CI runner with coverage on; finding a button by
// its role walks every row as well, so these two find their buttons by text or
// title and have longer to run.
const bigList = { timeout: 20_000 };
const button = (name: RegExp) => screen.getByText(name).closest('button');

describe('the Flexible editor add buttons', () => {
  it('add no section past the most a sheet keeps', () => {
    const sections = many(FLEXIBLE_MAX_SECTIONS, (i) => ({ id: `s${i}`, title: `Notes ${i}`, type: 'text', value: '' }));
    render(<FlexibleCharacterSheetEdit character={{ ...character, data: { sections } } as unknown as Character} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Add Section/ })).toBeDisabled();
    expect(full(FLEXIBLE_MAX_SECTIONS)).toBeInTheDocument();
  });

  it('add sections below that', () => {
    render(<FlexibleCharacterSheetEdit character={character} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Add Section/ })).toBeEnabled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('add no stat past the most a section keeps', () => {
    const section = { id: 's1', title: 'Stats', type: 'stats', fields: many(FLEXIBLE_MAX_FIELDS, (i) => ({ id: `f${i}`, name: `Stat ${i}`, value: 10, modifier: 0 })) } as StatsSection;
    render(<StatsEditor section={section} onUpdate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Add Stat/ })).toBeDisabled();
    expect(full(FLEXIBLE_MAX_FIELDS)).toBeInTheDocument();
  });

  it('add no list entry past the most a list keeps', bigList, () => {
    const section = { id: 's2', title: 'Kit', type: 'list', items: many(FLEXIBLE_MAX_ROWS, (i) => ({ id: `i${i}`, text: `Item ${i}`, checked: false })) } as ListSection;
    render(<ListEditor section={section} onUpdate={vi.fn()} />);
    expect(button(/Add Item/)).toBeDisabled();
    expect(full(FLEXIBLE_MAX_ROWS)).toBeInTheDocument();
  });

  it('add no column or row past the most a table keeps', bigList, () => {
    const columns = many(FLEXIBLE_MAX_COLUMNS, (i) => ({ id: `c${i}`, name: `Col ${i}` }));
    const section = { id: 's4', title: 'Gear', type: 'table', columns, rows: [] } as TableSection;
    const { unmount } = render(<TableEditor section={section} onUpdate={vi.fn()} />);
    expect(screen.getByTitle('Add column')).toBeDisabled();
    expect(full(FLEXIBLE_MAX_COLUMNS)).toBeInTheDocument();
    expect(button(/Add Row/)).toBeEnabled();
    unmount();

    const rows = many(FLEXIBLE_MAX_ROWS, (i) => ({ id: `r${i}`, cells: { c1: '' } }));
    render(<TableEditor section={{ ...section, columns: [{ id: 'c1', name: 'Item' }], rows }} onUpdate={vi.fn()} />);
    expect(button(/Add Row/)).toBeDisabled();
    expect(full(FLEXIBLE_MAX_ROWS)).toBeInTheDocument();
    expect(screen.getByTitle('Add column')).toBeEnabled();
  });
});
