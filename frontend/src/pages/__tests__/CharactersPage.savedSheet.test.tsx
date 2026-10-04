/**
 * The Characters page shows a sheet as it was last saved.
 *
 * Saving from the editor that opens over a sheet left the page's own copy of
 * the character as it was, so closing the sheet and opening it again showed
 * the old version, and a second edit made from it was refused as out of date.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Character } from '@/types';
import CharactersPage from '../CharactersPage';

const stored: Character = {
  id: 'char-1', userId: 'u1', name: 'Sheet A', gameSystem: 'DND_5E', campaignId: null,
  data: { background: 'Sage' }, updatedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as Character;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', platformRole: 'USER' }, logout: vi.fn() }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ mascotUrl: '' }),
}));
vi.mock('@/services/character.service', () => ({
  default: { getCharacters: () => Promise.resolve([stored]) },
}));
vi.mock('@/services/campaign.service', () => ({
  default: { getCampaigns: () => Promise.resolve([]) },
}));
// The sheet's own behaviour is covered elsewhere; this stands in for it and
// reports a save the way the real one does.
vi.mock('@/components/character/CharacterSheetViewerModal', () => ({
  default: ({ character, onClose, onCharacterChanged }: {
    character: Character;
    onClose: () => void;
    onCharacterChanged?: (saved: Character) => void;
  }) => (
    <div role="dialog" aria-label={character.name}>
      <p>Background: {String((character.data as { background?: string }).background)}</p>
      <button
        type="button"
        onClick={() => onCharacterChanged?.({
          ...character,
          data: { ...character.data, background: 'Scholar' },
          updatedAt: '2026-01-01T00:00:09.000Z',
        } as Character)}
      >
        Save from the editor
      </button>
      <button type="button" onClick={onClose}>Close sheet</button>
    </div>
  ),
}));

describe('Characters page after an in-page save', () => {
  it('opens the saved version when the card is clicked again', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CharactersPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await userEvent.click(await screen.findByText('Sheet A'));
    expect(screen.getByText('Background: Sage')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save from the editor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close sheet' }));

    await userEvent.click(screen.getByText('Sheet A'));
    expect(screen.getByText('Background: Scholar')).toBeInTheDocument();
  });
});
