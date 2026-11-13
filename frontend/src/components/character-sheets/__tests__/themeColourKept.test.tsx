/**
 * A colour picked in the editor stays picked when the character handed to the
 * editor is refreshed.
 *
 * The editor read the sheet's saved colour whenever the character it was
 * handed changed, not only when it opened. The character is refreshed while
 * the editor is open, by the sheet behind it following the table or by a save
 * refused as out of date fetching the newest version, and a colour saved
 * elsewhere then replaced the one the user had just picked.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import type { Character, CharacterData } from '@/types';
import { FifthEditionCharacterEditor } from '../fifth-edition/FifthEditionCharacterEditor';
import FantasyD20CharacterEditor from '../fantasy-d20/FantasyD20CharacterEditor';
import { fifthEditionCharacter } from '../fifth-edition/__tests__/fifthEditionFixture';
import { fantasyD20Character } from '../fantasy-d20/__tests__/fantasyD20Fixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

interface EditorProps {
  character: Character;
  onSave: (data: CharacterData) => Promise<void>;
  onCancel: () => void;
}

const cases: { name: string; Editor: ComponentType<EditorProps>; character: (theme: string) => Character; picked: string; elsewhere: string }[] = [
  { name: '5E', Editor: FifthEditionCharacterEditor, character: (theme) => fifthEditionCharacter({ themeColor: theme }), picked: 'Royal Blue', elsewhere: 'Teal' },
  { name: 'Fantasy d20', Editor: FantasyD20CharacterEditor, character: (theme) => fantasyD20Character({ themeColor: theme }), picked: 'Golden', elsewhere: 'Emerald' },
];

describe.each(cases)('the $name editor', ({ Editor, character, picked, elsewhere }) => {
  it('keeps the colour the user picked when the character is refreshed', async () => {
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    const start = character('');
    const { rerender } = render(<Editor character={start} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByTitle('Change theme color'));
    fireEvent.click(screen.getByRole('button', { name: picked }));
    rerender(<Editor character={{ ...character(elsewhere), updatedAt: '2026-01-01T00:00:05.000Z' }} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0][0] as unknown as { themeColor?: string }).themeColor).toBe(picked);
  });
});
