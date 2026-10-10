/**
 * A flexible sheet keeps what it stores beside its sections.
 *
 * The editor saved exactly `{ sections }`, so anything else in a character's
 * sheet, from an import or a program using the API, was dropped the first time
 * it was saved.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Character, CharacterData } from '@/types';
import { FlexibleCharacterSheetEdit } from '../flexible/FlexibleCharacterSheetEdit';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

function flexible(data: Record<string, unknown>): Character {
  return {
    id: 'flex-1', userId: 'user-1', name: 'Freeform', gameSystem: null, campaignId: null, tokenImageUrl: null,
    data, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Character;
}

describe('saving a flexible sheet', () => {
  it('keeps the fields stored beside the sections', async () => {
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    const character = flexible({
      sections: [{ id: 's1', title: 'Notes', type: 'text', value: '' }],
      hp: 30,
      notes: 'Imported from elsewhere',
    });
    render(<FlexibleCharacterSheetEdit character={character} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Enter text content...'), { target: { value: 'New note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toEqual({
      sections: [{ id: 's1', title: 'Notes', type: 'text', value: 'New note' }],
      hp: 30,
      notes: 'Imported from elsewhere',
    });
  });

  it('keeps them when the sheet had no sections yet', async () => {
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    render(<FlexibleCharacterSheetEdit character={flexible({ hp: 30 })} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toEqual({ sections: [], hp: 30 });
  });
});
