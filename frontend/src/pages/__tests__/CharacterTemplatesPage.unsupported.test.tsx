/**
 * A template stored with a game system CozyVTT no longer supports offers no
 * Use.
 *
 * Use was offered on it, and pressing it sent the stored system to the
 * server, which refuses it, so the page showed a refusal for something it
 * had offered. Such a template can still be read, edited by its author and
 * deleted; its card names its system Unsupported system.
 */

import { it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CharacterTemplatesPage from '../CharacterTemplatesPage';
import type { CharacterTemplateSummary } from '@/types';

const summary = (id: string, name: string, gameSystem: string | null) => ({
  id, name, description: null, gameSystem, tokenImageUrl: null, createdById: 'u1',
  createdBy: { id: 'u1', displayName: 'Ada' },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as CharacterTemplateSummary);

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/services/api', () => {
  const api = {
    listCharacterTemplates: () => Promise.resolve({
      templates: [summary('t1', 'Old Ranger', 'NOT_A_SYSTEM'), summary('t2', 'Level 1 Fighter', 'FIFTH_EDITION')],
    }),
  };
  return { default: api, api };
});

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/templates']}>
        <CharacterTemplatesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** The card holding a template's name. */
async function card(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name });
  const article = heading.closest('article');
  if (!article) throw new Error(`no card holds ${name}`);
  return article;
}

it('offers no Use on a template of an unsupported system, and keeps its other controls', async () => {
  renderPage();
  const old = await card('Old Ranger');
  expect(within(old).getByText(/Unsupported system/)).toBeInTheDocument();
  expect(within(old).queryByRole('button', { name: /^Use$/ })).toBeNull();
  expect(within(old).getByRole('button', { name: 'Edit Old Ranger' })).toBeInTheDocument();
  expect(within(old).getByRole('button', { name: 'Delete Old Ranger' })).toBeInTheDocument();
});

it('still offers Use on a template of a supported system', async () => {
  renderPage();
  const fighter = await card('Level 1 Fighter');
  expect(within(fighter).getByRole('button', { name: /^Use$/ })).toBeInTheDocument();
});
