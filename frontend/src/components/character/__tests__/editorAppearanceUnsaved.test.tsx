/**
 * A new header colour or token picture is an unsaved change.
 *
 * The D&D 5e, Pathfinder 2e and Call of Cthulhu editors keep both outside the
 * form they compare to decide what is unsaved, so choosing only a colour or a
 * picture and then leaving closed the editor without asking, and the choice
 * was lost.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Character } from '@/types';
import CharacterSheetEditorModal from '../CharacterSheetEditorModal';
import { pf2eCharacter } from '@/components/character-sheets/pathfinder2e/__tests__/pf2eFixture';
import { cocCharacter } from '@/components/character-sheets/call-of-cthulhu-7e/__tests__/cocFixture';

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
const dnd5eCharacter = {
  id: 'char-1', userId: 'user-1', name: 'Aldra', gameSystem: 'DND_5E', campaignId: null,
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
  { system: 'D&D 5e', character: () => dnd5eCharacter, current: 'Classic Red', other: 'Royal Blue' },
  { system: 'Pathfinder 2e', character: () => pf2eCharacter(), current: 'Pathfinder Blue', other: 'Golden' },
  { system: 'Call of Cthulhu', character: () => cocCharacter(), current: 'Dark Forest', other: 'Noir Shadow' },
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
    const { container } = render(<CharacterSheetEditorModal character={character()} onClose={onClose} />);

    const picker = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(picker).not.toBeNull();
    await userEvent.upload(picker!, new File(['png'], 'token.png', { type: 'image/png' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(screen.getByText('Discard Changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
