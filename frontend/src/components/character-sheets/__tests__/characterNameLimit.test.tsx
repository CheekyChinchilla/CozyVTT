/**
 * Each editor's character name box stops at the 200 characters the server
 * keeps. Saving a sheet copies that name into the character's name, which has
 * that limit, and a longer one is refused.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FifthEditionCharacterEditor } from '../fifth-edition/FifthEditionCharacterEditor';
import { FantasyD20CharacterEditor } from '../fantasy-d20/FantasyD20CharacterEditor';
import { HorrorD100CharacterEditor } from '../horror-d100/HorrorD100CharacterEditor';
import { fifthEditionCharacter } from '../fifth-edition/__tests__/fifthEditionFixture';
import { fantasyD20Character } from '../fantasy-d20/__tests__/fantasyD20Fixture';
import { horrorD100Character } from '../horror-d100/__tests__/sheetFixture';
import { SHEET_NAME_MAX } from '@/constants/sheetLimits';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const props = { onSave: vi.fn(), onCancel: vi.fn() };

describe('the character name box', () => {
  it('stops at the limit in the 5E editor', () => {
    render(<FifthEditionCharacterEditor character={fifthEditionCharacter()} {...props} />);
    expect(screen.getByPlaceholderText('Character Name')).toHaveAttribute('maxLength', String(SHEET_NAME_MAX));
  });

  it('stops at the limit in the Fantasy d20 editor', () => {
    render(<FantasyD20CharacterEditor character={fantasyD20Character()} {...props} />);
    expect(screen.getByPlaceholderText('Character Name')).toHaveAttribute('maxLength', String(SHEET_NAME_MAX));
  });

  it('stops at the limit in the Horror d100 editor', () => {
    render(<HorrorD100CharacterEditor character={horrorD100Character()} {...props} />);
    expect(screen.getByPlaceholderText('Character Name')).toHaveAttribute('maxLength', String(SHEET_NAME_MAX));
  });
});
