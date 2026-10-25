/**
 * Create & Publish as Template that makes the character and not the template.
 *
 * The dialog closes either way, so the page says what happened: a warning
 * that the character was made and the template was not, with the server's
 * reason when it gave one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Character } from '@/types';
import type { TemplatePublishFailure } from '@/components/character/NewCharacterModal';
import CharactersPage from '../CharactersPage';

const showToast = vi.fn();
const created = {
  id: 'char-2', userId: 'u1', name: 'Aldra', gameSystem: null, campaignId: null, campaign: null,
  tokenImageUrl: null, data: {}, updatedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as Character;
const outcome: { failure?: TemplatePublishFailure } = {};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', platformRole: 'USER' }, logout: vi.fn() }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ mascotUrl: '' }),
}));
vi.mock('@/services/character.service', () => ({
  default: { getCharacters: () => Promise.resolve([]) },
}));
vi.mock('@/services/campaign.service', () => ({
  default: { getCampaigns: () => Promise.resolve([]) },
}));
// The dialog's own behaviour is tested beside it; here it only reports back.
vi.mock('@/components/character/NewCharacterModal', () => ({
  default: ({ isOpen, onSuccess }: { isOpen: boolean; onSuccess: (c: Character, f?: TemplatePublishFailure) => void }) =>
    isOpen ? <button onClick={() => onSuccess(created, outcome.failure)}>Finish creating</button> : null,
}));

beforeEach(() => {
  showToast.mockReset();
  delete outcome.failure;
});

async function createFromThePage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CharactersPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const [newCharacter] = await screen.findAllByRole('button', { name: /New Character|Create Character/ });
  await userEvent.click(newCharacter);
  await userEvent.click(screen.getByRole('button', { name: 'Finish creating' }));
}

describe('a character made without its template', () => {
  it('is reported as a warning with the server\'s reason', async () => {
    outcome.failure = { templateFailed: true, reason: 'A template with this name already exists' };
    await createFromThePage();

    expect(showToast).toHaveBeenCalledTimes(1);
    const [message, type] = showToast.mock.calls[0];
    expect(type).toBe('warning');
    expect(message).toContain('Aldra was created, but it was not published as a template');
    expect(message).toContain('A template with this name already exists');
  });

  it('is reported without a reason when the server gave none', async () => {
    outcome.failure = { templateFailed: true };
    await createFromThePage();

    const [message, type] = showToast.mock.calls[0];
    expect(type).toBe('warning');
    expect(message).toContain('Aldra was created, but it was not published as a template.');
  });

  it('is a plain success when nothing failed', async () => {
    await createFromThePage();

    expect(showToast).toHaveBeenCalledWith('Character created successfully!', 'success');
  });
});
