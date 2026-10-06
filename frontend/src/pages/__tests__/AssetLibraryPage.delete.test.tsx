/**
 * Deleting from the Asset Library when the asset is still in use.
 *
 * The server refuses to delete an asset a map, token or template still names,
 * answering 409 with where it is used. The library used to turn every refusal
 * into a bare "Failed to delete asset" toast. It now shows where the asset is
 * used and deletes it anyway only after a second confirmation, from the card
 * and from the detail panel alike.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Asset } from '@/types';
import { AssetScope, AssetType } from '@/types';
import AssetLibraryPage from '../AssetLibraryPage';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', platformRole: 'USER', globalAssetManager: false } }),
}));
vi.mock('../../contexts/AuthContext', () => ({
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
  default: { getCampaigns: () => Promise.resolve([]) },
}));

const api = vi.hoisted(() => ({
  deleteAsset: vi.fn(),
  getAssetUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}`,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

const inUse = {
  response: {
    status: 409,
    data: {
      error: 'Conflict',
      code: 'ASSET_IN_USE',
      message: 'This asset is still in use.',
      usage: [{ kind: 'creature', name: 'Imp', campaignId: 'c-1', campaignName: 'Lost Mine', count: 1 }],
      omitted: 0,
    },
  },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AssetLibraryPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function startDeleteFromCard() {
  await userEvent.click(screen.getByRole('button', { name: 'List view' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Delete Imp token' }));
  const first = await screen.findByRole('dialog', { name: 'Delete Asset' });
  await userEvent.click(within(first).getByRole('button', { name: 'Delete' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.deleteAsset.mockResolvedValue({ message: 'Asset deleted successfully' });
});

describe('Asset Library delete', () => {
  it('deletes an unused asset after the first confirmation', async () => {
    renderPage();
    await startDeleteFromCard();

    await waitFor(() => expect(api.deleteAsset).toHaveBeenCalledWith('asset-9'));
    expect(await screen.findByText('Asset deleted successfully')).toBeInTheDocument();
  });

  it('shows where an asset in use is used, and forces the delete only after a second yes', async () => {
    api.deleteAsset.mockRejectedValueOnce(inUse);
    renderPage();
    await startDeleteFromCard();

    const warning = await screen.findByRole('dialog', { name: 'Asset is in use' });
    expect(warning).toHaveTextContent('Imp token');
    expect(warning).toHaveTextContent('Creature "Imp" (Lost Mine)');
    expect(api.deleteAsset).toHaveBeenCalledTimes(1);

    await userEvent.click(within(warning).getByRole('button', { name: 'Delete anyway' }));

    await waitFor(() => expect(api.deleteAsset).toHaveBeenLastCalledWith('asset-9', { force: true }));
    expect(await screen.findByText('Asset deleted successfully')).toBeInTheDocument();
  });

  it('forces nothing when the warning is cancelled', async () => {
    api.deleteAsset.mockRejectedValueOnce(inUse);
    renderPage();
    await startDeleteFromCard();

    const warning = await screen.findByRole('dialog', { name: 'Asset is in use' });
    await userEvent.click(within(warning).getByRole('button', { name: 'Cancel' }));

    expect(api.deleteAsset).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Asset is in use' })).not.toBeInTheDocument());
  });

  it("reports the server's reason when the delete is refused for another reason", async () => {
    api.deleteAsset.mockRejectedValueOnce({
      response: { status: 403, data: { message: 'Only the owner can delete personal assets' } },
    });
    renderPage();
    await startDeleteFromCard();

    expect(await screen.findByText('Only the owner can delete personal assets')).toBeInTheDocument();
  });

  it('asks about an asset in use from the detail panel too', async () => {
    api.deleteAsset.mockRejectedValueOnce(inUse);
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'List view' }));
    await userEvent.click(await screen.findByRole('button', { name: 'View details' }));
    // The panel's own Delete button, not the card's icon.
    const panelDelete = await screen.findByRole('button', { name: 'Delete' });
    await userEvent.click(panelDelete);
    const first = await screen.findByRole('dialog', { name: 'Delete Asset' });
    await userEvent.click(within(first).getByRole('button', { name: 'Delete' }));

    const warning = await screen.findByRole('dialog', { name: 'Asset is in use' });
    await userEvent.click(within(warning).getByRole('button', { name: 'Delete anyway' }));

    await waitFor(() => expect(api.deleteAsset).toHaveBeenLastCalledWith('asset-9', { force: true }));
  });
});
