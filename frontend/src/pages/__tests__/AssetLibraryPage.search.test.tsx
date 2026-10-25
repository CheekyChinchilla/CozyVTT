/**
 * The Asset Library's search and sort cover the whole library.
 *
 * They ran in the browser on the one page of 24 the server had sent, so an
 * asset on another page could not be found and Sort by Name sorted 24. Both
 * now go to the server, from the first page. The tag chips still come from
 * the page on screen, and say so.
 */
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Asset } from '@/types';
import { AssetScope, AssetType } from '@/types';
import AssetLibraryPage from '../AssetLibraryPage';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', platformRole: 'USER', globalAssetManager: false } }),
}));

const cave: Asset = {
  id: 'a1', type: AssetType.MAP, scope: AssetScope.USER, uploadedById: 'u1', campaignId: null,
  filename: 'a1.png', originalName: 'cave.png', mimeType: 'image/png', fileSize: 2048,
  name: 'Cave', description: null, tags: ['underground'], createdAt: '2026-01-01T00:00:00.000Z', canChange: true,
};

const asked = vi.hoisted(() => ({ params: [] as Array<Record<string, unknown>> }));
vi.mock('@/hooks/queries', () => ({
  useAssetsQuery: (params: Record<string, unknown>) => {
    asked.params.push(params);
    return { data: { assets: [cave], pagination: { page: 1, limit: 24, total: 60, totalPages: 3 } }, isPending: false, isError: false };
  },
}));
vi.mock('@/components/assets/AssetUploadModal', () => ({ default: () => null }));
vi.mock('@/services/campaign.service', () => ({ default: { getCampaigns: () => Promise.resolve([]) } }));
vi.mock('@/services/api', () => {
  const api = {
    getAssetUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}`,
    getAssetThumbnailUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}/thumbnail`,
  };
  return { api, default: api };
});

beforeEach(() => {
  asked.params = [];
});

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AssetLibraryPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const lastAsked = () => asked.params[asked.params.length - 1];

it('sends the search to the server, from the first page', async () => {
  renderPage();
  await userEvent.click(screen.getByRole('button', { name: /next/i }));
  await waitFor(() => expect(lastAsked()).toMatchObject({ page: 2 }));

  await userEvent.type(screen.getByRole('searchbox'), 'dragon');

  await waitFor(() => expect(lastAsked()).toMatchObject({ search: 'dragon', page: 1 }));
  // The page shows what the server found; it does not search it again.
  expect(screen.getByText('Cave')).toBeInTheDocument();
});

it('sends the sort to the server', async () => {
  renderPage();
  await userEvent.selectOptions(screen.getByDisplayValue('Sort by Date'), 'name');
  await waitFor(() => expect(lastAsked()).toMatchObject({ sort: 'name', page: 1 }));
});

it('says the tag chips are the tags on this page', () => {
  renderPage();
  expect(screen.getByText('Tags on this page:')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'underground' })).toBeInTheDocument();
});
