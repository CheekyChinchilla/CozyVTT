/**
 * A Flexible sheet stored in a shape its page does not expect still opens.
 *
 * Before the server checked Flexible sheets, one could be stored with a
 * section missing its entries, a section of a type the sheet does not know,
 * or a table cell holding an object. The view and the editor read those as
 * they were and threw, so the sheet could neither be read nor put right.
 * They now show what can be shown, and the editor saves a sheet the server
 * accepts.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Character, CharacterData } from '@/types';
import { FlexibleCharacterSheetView } from '../flexible/FlexibleCharacterSheetView';
import { FlexibleCharacterSheetEdit } from '../flexible/FlexibleCharacterSheetEdit';
import { initializeFlexibleData } from '../flexible/utils/section-helpers';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const malformed = {
  sections: [
    { id: 'stats', title: 'Attributes', type: 'stats' },
    { id: 'list', title: 'Kit', type: 'list', items: [{ id: 'i1', text: 'Rope' }, 'not an entry', { id: 'i2', text: { nested: 1 } }] },
    { id: 'odd', title: 'Mystery', type: 'chart', points: [1, 2] },
    'not a section',
    { id: 'text', title: 'Story', type: 'text', value: 42 },
    {
      id: 'table', title: 'Gear', type: 'table',
      columns: [{ id: 'c1', name: 'Item' }, { id: 'c2', name: 'Qty' }],
      rows: [{ id: 'r1', cells: { c1: { nested: true }, c2: 3 } }, { id: 'r2' }],
    },
    { title: 'No id', type: 'stats', fields: [{ name: 'Luck', value: '7' }] },
  ],
  hp: 30,
};

function flexible(data: unknown): Character {
  return {
    id: 'flex-1', userId: 'user-1', name: 'Odd Sheet', gameSystem: null, campaignId: null, tokenImageUrl: null,
    data, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Character;
}

describe('a malformed Flexible sheet', () => {
  it('is shown, with the sections the sheet knows', () => {
    render(<FlexibleCharacterSheetView character={flexible(malformed)} />);

    expect(screen.getByText('Attributes')).toBeInTheDocument();
    expect(screen.getByText('Rope')).toBeInTheDocument();
    expect(screen.getByText('Story')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Gear')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Luck')).toBeInTheDocument();
    expect(screen.queryByText('Mystery')).toBeNull();
  });

  it('opens in the editor and saves in a shape the server accepts', async () => {
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    render(<FlexibleCharacterSheetEdit character={flexible(malformed)} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const saved = onSave.mock.calls[0][0] as unknown as { sections: Array<Record<string, unknown>>; hp: number };
    expect(saved.hp).toBe(30);
    expect(saved.sections.map((s) => s.type)).toEqual(['stats', 'list', 'text', 'table', 'stats']);
    expect(saved.sections[0].fields).toEqual([]);
    expect(saved.sections[1].items).toEqual([
      { id: 'i1', text: 'Rope' },
      expect.objectContaining({ text: '' }),
    ]);
    expect(saved.sections[2].value).toBe('42');
    expect(saved.sections[3].rows).toEqual([
      { id: 'r1', cells: { c1: '', c2: '3' } },
      { id: 'r2', cells: {} },
    ]);
    expect(saved.sections[4]).toMatchObject({ title: 'No id', fields: [expect.objectContaining({ name: 'Luck', value: 7 })] });
    expect(typeof saved.sections[4].id).toBe('string');
  });

  it('keeps a well-formed sheet exactly as it was', () => {
    const good = {
      sections: [
        { id: 's1', title: 'Stats', type: 'stats', fields: [{ id: 'f1', name: 'Str', value: 12, modifier: 1 }], collapsed: true },
        { id: 's2', title: 'Notes', type: 'text', value: 'Hello' },
      ],
    };
    expect(initializeFlexibleData(good)).toEqual(good);
  });

  it('gives a sheet that is not one no sections', () => {
    expect(initializeFlexibleData('text').sections).toEqual([]);
    expect(initializeFlexibleData(null).sections).toEqual([]);
    expect(initializeFlexibleData({ sections: 'many' }).sections).toEqual([]);
  });
});
