/**
 * Saving from the full-page editor updates the Characters page's own copy.
 *
 * The Characters page keeps its list of characters in a shared cache, and the
 * full-page editor saved without touching it. Back on the Characters page the
 * card, its sheet, its export and its editor all worked from the version
 * before the save, and an edit made from that old copy was refused as out of
 * date, which looked like the earlier save had been lost. The list now holds
 * each character without its sheet, as the server lists it.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CharacterEditorPage from '../CharacterEditorPage';
import { fantasyD20Character } from '@/components/character-sheets/fantasy-d20/__tests__/fantasyD20Fixture';
import { queryKeys, toCharacterSummary } from '@/hooks/queries';
import type { Character, CharacterSummary } from '@/types';

const showToast = vi.fn();
const auth = { user: { id: 'user-1', platformRole: 'USER' } };

vi.mock('@/hooks/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/queries')>()),
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => auth,
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));
vi.mock('@/components/character/NewCharacterTemplateModal', () => ({ default: () => null }));
vi.mock('@/services/character.service', () => ({
  default: { getCharacter: vi.fn(), updateCharacter: vi.fn(), exportCharacterJSON: vi.fn() },
}));

import characterService from '@/services/character.service';

const getCharacter = characterService.getCharacter as ReturnType<typeof vi.fn>;
const updateCharacter = characterService.updateCharacter as ReturnType<typeof vi.fn>;

const other = { ...fantasyD20Character(), id: 'char-2', name: 'Someone else' } as Character;

function renderPage(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/characters/char-1/edit']}>
        <Routes>
          <Route path="/characters/:id/edit" element={<CharacterEditorPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function clientHoldingList(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  client.setQueryData<CharacterSummary[]>(queryKeys.characters, [toCharacterSummary(fantasyD20Character()), toCharacterSummary(other)]);
  return client;
}

// The sheet loads on demand. Loaded here first, the first test does not wait
// on the import, which on a busy machine outlasted the default wait.
beforeAll(async () => {
  await import('@/components/character-sheets/fantasy-d20/FantasyD20CharacterSheet');
}, 30_000);

beforeEach(() => {
  showToast.mockReset();
  getCharacter.mockReset().mockResolvedValue(fantasyD20Character());
  updateCharacter.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the Characters page list after a full-page save', () => {
  it('holds the saved character, and is marked for a refetch', async () => {
    const saved = { ...fantasyD20Character({ characterName: 'Maren the Bold' }), updatedAt: '2026-01-01T00:00:09.000Z' };
    updateCharacter.mockResolvedValue(saved);
    const client = clientHoldingList();
    renderPage(client);

    const name = (await screen.findByPlaceholderText('Character Name')) as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Maren the Bold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(client.getQueryData<CharacterSummary[]>(queryKeys.characters)?.[0]).toEqual(toCharacterSummary(saved)));
    expect(client.getQueryData<CharacterSummary[]>(queryKeys.characters)?.[1]).toEqual(toCharacterSummary(other));
    expect(client.getQueryState(queryKeys.characters)?.isInvalidated).toBe(true);
  });

  it('holds the newer version after a save refused as out of date', async () => {
    const fresh = { ...fantasyD20Character({ deity: 'Changed elsewhere' }), updatedAt: '2026-01-01T00:00:05.000Z' };
    updateCharacter.mockRejectedValue({
      response: { status: 409, data: { error: 'Conflict', code: 'CHARACTER_CHANGED', message: 'changed' } },
    });
    getCharacter.mockResolvedValueOnce(fantasyD20Character()).mockResolvedValue(fresh);
    const client = clientHoldingList();
    renderPage(client);

    const name = (await screen.findByPlaceholderText('Character Name')) as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Maren the Bold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(client.getQueryData<CharacterSummary[]>(queryKeys.characters)?.[0]).toEqual(toCharacterSummary(fresh)));
  });

  it('does not write the sheet to the browser console', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    updateCharacter.mockResolvedValue(fantasyD20Character());
    renderPage(clientHoldingList());

    await screen.findByPlaceholderText('Character Name');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateCharacter).toHaveBeenCalled());

    expect(log).not.toHaveBeenCalledWith('Saving character data:', expect.anything());
  });
});
