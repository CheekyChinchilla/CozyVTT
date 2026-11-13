/**
 * A new header colour or token picture is an unsaved change.
 *
 * The 5E, Fantasy d20 and Horror d100 editors keep both outside the
 * form they compare to decide what is unsaved, so choosing only a colour or a
 * picture and then leaving closed the editor without asking, and the choice
 * was lost.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Character } from '@/types';
import CharacterSheetEditorModal from '../CharacterSheetEditorModal';
import { fantasyD20Character } from '@/components/character-sheets/fantasy-d20/__tests__/fantasyD20Fixture';
import { horrorD100Character } from '@/components/character-sheets/horror-d100/__tests__/sheetFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/services/api', () => ({
  api: { updateCharacter: vi.fn() },
}));

const ability = { score: 10, modifier: 0 };
const fifthEditionCharacter = {
  id: 'char-1', userId: 'user-1', name: 'Aldra', gameSystem: 'FIFTH_EDITION', campaignId: null,
  tokenImageUrl: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  data: {
    characterName: 'Aldra', class: 'Fighter', level: 1, race: 'Human', proficiencyBonus: 2,
    stats: {
      strength: ability, dexterity: ability, constitution: ability,
      intelligence: ability, wisdom: ability, charisma: ability,
    },
    hp: { maximum: 12, current: 12, temporary: 0 },
  },
} as unknown as Character;

// Each system's own presets: the first is what a sheet with no colour opens
// with, the second is a different one.
const systems = [
  { system: '5E', character: () => fifthEditionCharacter, current: 'Classic Red', other: 'Royal Blue' },
  { system: 'Fantasy d20', character: () => fantasyD20Character(), current: 'Royal Blue', other: 'Golden' },
  { system: 'Horror d100', character: () => horrorD100Character(), current: 'Dark Forest', other: 'Noir Shadow' },
];

describe.each(systems)('leaving the $system editor', ({ character, current, other }) => {
  it('asks when only the header colour was changed', async () => {
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={character()} onClose={onClose} />);

    await userEvent.click(screen.getByTitle('Change theme color'));
    await userEvent.click(screen.getByRole('button', { name: other }));
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(screen.getByText('Discard Changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes at once when the colour picked is the one already set', async () => {
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={character()} onClose={onClose} />);

    await userEvent.click(screen.getByTitle('Change theme color'));
    await userEvent.click(screen.getByRole('button', { name: current }));
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('asks when only a new token picture was chosen', async () => {
    const onClose = vi.fn();
    render(<CharacterSheetEditorModal character={character()} onClose={onClose} />);

    // The editor is portaled to the body, outside the render's container.
    const picker = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(picker).not.toBeNull();
    await userEvent.upload(picker!, new File(['png'], 'token.png', { type: 'image/png' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(screen.getByText('Discard Changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
