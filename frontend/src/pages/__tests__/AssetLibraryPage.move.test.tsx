/**
 * An asset moved from the detail panel takes its new place in the library.
 *
 * The page gave the panel nothing to tell it of a move, so the asset stayed
 * listed where it had been, under its old scope filter and badge, until the
 * list was fetched again. The page now fetches the library again once a move
 * goes through.
 */
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Asset } from '@/types';
import { AssetScope, AssetType } from '@/types';
import AssetLibraryPage from '../AssetLibraryPage';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', platformRole: 'USER', globalAssetManager: false } }),
}));

const token: Asset = {
  id: 'asset-9',
  type: AssetType.TOKEN,
  scope: AssetScope.USER,
  uploadedById: 'u1',
  campaignId: null,
  filename: 'imp.png',
  originalName: 'imp.png',
  mimeType: 'image/png',
  fileSize: 2048,
  name: 'Imp token',
  description: null,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  canChange: true,
};

vi.mock('@/hooks/queries', () => ({
  useAssetsQuery: () => ({
    data: { assets: [token], pagination: { page: 1, limit: 24, total: 1, totalPages: 1 } },
    isPending: false,
    isError: false,
  }),
}));

vi.mock('@/components/assets/AssetUploadModal', () => ({ default: () => null }));
vi.mock('@/services/campaign.service', () => ({
  default: { getCampaigns: () => Promise.resolve([{ id: 'c1', name: 'My table', userRole: 'DM' }]) },
}));

const api = vi.hoisted(() => ({
  patchAssetScope: vi.fn(),
  getAssetUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}`,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

it('fetches the library again once the move goes through', async () => {
  api.patchAssetScope.mockResolvedValue({ asset: { ...token, scope: AssetScope.CAMPAIGN, campaignId: 'c1', canChange: true } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AssetLibraryPage />
      </MemoryRouter>
    </QueryClientProvider>
  );

  await userEvent.click(screen.getByRole('button', { name: 'List view' }));
  await userEvent.click(await screen.findByRole('button', { name: 'View details' }));
  // The panel's Move section, apart from the page's own scope filter.
  const move = within((await screen.findByText('Move to…')).parentElement!);
  await userEvent.click(await move.findByRole('button', { name: 'Campaign' }));
  await userEvent.selectOptions(move.getByRole('combobox'), 'c1');
  await userEvent.click(move.getByRole('button', { name: 'Move to Campaign' }));

  expect(await screen.findByText('Asset moved successfully.')).toBeInTheDocument();
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['assets'] }));
});
