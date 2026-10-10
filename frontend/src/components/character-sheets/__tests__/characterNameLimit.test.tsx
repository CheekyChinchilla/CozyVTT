/**
 * Each editor's character name box stops at the 200 characters the server
 * keeps. Saving a sheet copies that name into the character's name, which has
 * that limit, and a longer one is refused.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../dnd5e/DnD5eCharacterEditor';
import { Pathfinder2eCharacterEditor } from '../pathfinder2e/Pathfinder2eCharacterEditor';
import { CallOfCthulhu7eCharacterEditor } from '../call-of-cthulhu-7e/CallOfCthulhu7eCharacterEditor';
import { dnd5eCharacter } from '../dnd5e/__tests__/dnd5eFixture';
import { pf2eCharacter } from '../pathfinder2e/__tests__/pf2eFixture';
import { cocCharacter } from '../call-of-cthulhu-7e/__tests__/cocFixture';
import { SHEET_NAME_MAX } from '@/constants/sheetLimits';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const props = { onSave: vi.fn(), onCancel: vi.fn() };

describe('the character name box', () => {
  it('stops at the limit in the D&D 5e editor', () => {
    render(<DnD5eCharacterEditor character={dnd5eCharacter()} {...props} />);
    expect(screen.getByPlaceholderText('Character Name')).toHaveAttribute('maxLength', String(SHEET_NAME_MAX));
  });

  it('stops at the limit in the Pathfinder 2e editor', () => {
    render(<Pathfinder2eCharacterEditor character={pf2eCharacter()} {...props} />);
    expect(screen.getByPlaceholderText('Character Name')).toHaveAttribute('maxLength', String(SHEET_NAME_MAX));
  });

  it('stops at the limit in the Call of Cthulhu editor', () => {
    render(<CallOfCthulhu7eCharacterEditor character={cocCharacter()} {...props} />);
    expect(screen.getByPlaceholderText('Investigator Name')).toHaveAttribute('maxLength', String(SHEET_NAME_MAX));
  });
});
