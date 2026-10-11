/**
 * A character made from a template is on the Characters page straight away.
 *
 * Using a template created the character and opened it in the editor, but the
 * Characters page's list was left as it was, so going back there could show a
 * library without the new character until the list happened to be fetched
 * again.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CharacterTemplatesPage from '../CharacterTemplatesPage';
import { queryKeys } from '@/hooks/queries';
import type { Character, CharacterTemplate, CharacterTemplateSummary } from '@/types';

/** What the list sends: every field but the sheet. */
const summary = {
  id: 'tpl-1',
  name: 'Level 1 Fighter',
  description: null,
  gameSystem: 'DND_5E',
  tokenImageUrl: null,
  createdById: 'someone',
  createdBy: { id: 'someone', displayName: 'Someone' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as CharacterTemplateSummary;
const template = { ...summary, data: { characterName: 'Level 1 Fighter' } } as unknown as CharacterTemplate;

const existing = { id: 'char-1', name: 'Older character' } as unknown as Character;
const created = { id: 'char-2', name: 'Level 1 Fighter', data: template.data } as unknown as Character;

const createCharacter = vi.fn();
const getCharacterTemplate = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/services/api', () => {
  const api = {
    listCharacterTemplates: () => Promise.resolve({ templates: [summary] }),
    getCharacterTemplate: (id: string) => getCharacterTemplate(id),
    createCharacter: (body: unknown) => createCharacter(body),
  };
  return { default: api, api };
});

beforeEach(() => {
  createCharacter.mockReset().mockResolvedValue({ character: created });
  getCharacterTemplate.mockReset().mockResolvedValue(template);
});

function renderPage(client: QueryClient) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/templates']}>
        <Routes>
          <Route path="/templates" element={<CharacterTemplatesPage />} />
          <Route path="/characters/:id/edit" element={<p>Editor</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('using a template', () => {
  it('adds the new character to the Characters page list', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData<Character[]>(queryKeys.characters, [existing]);
    renderPage(client);

    await userEvent.click(await screen.findByRole('button', { name: /^Use$/ }));
    await screen.findByText('Editor');

    await waitFor(() =>
      expect(client.getQueryData<Character[]>(queryKeys.characters)?.map((c) => c.id)).toEqual(['char-2', 'char-1'])
    );
  });

  // The list carries no sheets, so the template is fetched before it is copied.
  it('makes the character from the sheet fetched by id', async () => {
    renderPage(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    await userEvent.click(await screen.findByRole('button', { name: /^Use$/ }));
    await screen.findByText('Editor');

    expect(getCharacterTemplate).toHaveBeenCalledWith('tpl-1');
    expect(createCharacter).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Level 1 Fighter', data: { characterName: 'Level 1 Fighter' } })
    );
  });
});
