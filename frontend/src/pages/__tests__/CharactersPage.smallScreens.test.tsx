/**
 * The Characters page on a phone.
 *
 * Its header kept the mascot and the title beside Dashboard, Refresh and Log
 * out on one line, and the list's heading beside Import and Create Character,
 * so on a phone the whole page was wider than the screen and scrolled
 * sideways, a character's sheet opened over it with it. Both rows now wrap,
 * the buttons going under the title where the line is too narrow for both,
 * as the dashboard's header does. The page is as tall as the browser shows
 * it (`min-h-dvh`), toolbar or not.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CharactersPage from '../CharactersPage';
import source from '../CharactersPage.tsx?raw';

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
  default: { getCharacters: () => Promise.resolve([]), getCharacter: vi.fn(), exportCharacterJSON: vi.fn() },
}));
vi.mock('@/services/campaign.service', () => ({
  default: { getCampaigns: () => Promise.resolve([]) },
}));

const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

/** The nearest element holding both. */
function around(a: Element, b: Element): Element {
  let at: Element | null = a;
  while (at && !at.contains(b)) at = at.parentElement;
  if (!at) throw new Error('no element holds both');
  return at;
}

const WRAPS = ['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-x-4', 'gap-y-3'];

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CharactersPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('the Characters page on a phone', () => {
  it('wraps its header, the buttons going under the title', async () => {
    renderPage();
    const title = await screen.findByRole('heading', { name: 'My Characters' });
    expect(classes(around(title, screen.getByRole('button', { name: 'Log out of CozyVTT' })))).toEqual(expect.arrayContaining(WRAPS));
  });

  it('wraps the list heading, Import and Create Character going under it', async () => {
    renderPage();
    const heading = await screen.findByRole('heading', { name: /Your Characters/ });
    expect(classes(around(heading, screen.getAllByRole('button', { name: /Create Character/ })[0]))).toEqual(expect.arrayContaining(WRAPS));
  });

  it('is as tall as the browser shows it', () => {
    expect(source.match(/\bmin-h-screen\b/g) ?? []).toEqual([]);
    expect(source).toMatch(/\bmin-h-dvh\b/);
  });
});
