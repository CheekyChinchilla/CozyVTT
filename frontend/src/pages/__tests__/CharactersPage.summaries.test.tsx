/**
 * The Characters page opens and exports the sheet fetched by id.
 *
 * The character list no longer carries sheets: every sheet can be up to a
 * megabyte, and the list is unpaged. The card's sheet and its Export as JSON
 * fetch the one character they need.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Character, CharacterSummary } from '@/types';
import CharactersPage from '../CharactersPage';

const summary = {
  id: 'char-1', userId: 'u1', name: 'Sheet A', gameSystem: 'DND_5E', campaignId: null, campaign: null,
  tokenImageUrl: null, updatedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as CharacterSummary;
const full = { ...summary, data: { background: 'Sage' } } as unknown as Character;

const getCharacter = vi.fn();
const exportCharacterJSON = vi.fn();

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
  default: {
    getCharacters: () => Promise.resolve([summary]),
    getCharacter: (id: string) => getCharacter(id),
    exportCharacterJSON: (character: Character) => exportCharacterJSON(character),
  },
}));
vi.mock('@/services/campaign.service', () => ({
  default: { getCampaigns: () => Promise.resolve([]) },
}));
vi.mock('@/components/character/CharacterSheetViewerModal', () => ({
  default: ({ character }: { character: Character }) => (
    <div role="dialog" aria-label={character.name}>
      <p>Background: {String((character.data as { background?: string } | undefined)?.background)}</p>
    </div>
  ),
}));

beforeEach(() => {
  getCharacter.mockReset().mockResolvedValue(full);
  exportCharacterJSON.mockReset();
});

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CharactersPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Characters page with a list that carries no sheets', () => {
  it('opens the sheet fetched by id', async () => {
    renderPage();
    await userEvent.click(await screen.findByText('Sheet A'));

    expect(await screen.findByText('Background: Sage')).toBeInTheDocument();
    expect(getCharacter).toHaveBeenCalledWith('char-1');
  });

  it('exports the sheet fetched by id', async () => {
    renderPage();
    await screen.findByText('Sheet A');
    await userEvent.click(screen.getByRole('button', { name: 'Character actions' }));
    await userEvent.click(screen.getByText('Export as JSON'));

    await vi.waitFor(() => expect(exportCharacterJSON).toHaveBeenCalledWith(full));
  });
});
