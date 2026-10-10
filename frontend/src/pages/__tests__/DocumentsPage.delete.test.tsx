/**
 * Deleting a document that something still uses.
 *
 * The Documents page already asked before deleting. If the server then says the
 * document is still named somewhere, it shows where and deletes only after a
 * second confirmation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Asset } from '@/types';
import { AssetScope, AssetType } from '@/types';
import DocumentsPage from '../DocumentsPage';

const showToast = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));

const doc: Asset = {
  id: 'doc-1',
  type: AssetType.DOCUMENT,
  scope: AssetScope.USER,
  uploadedById: 'u1',
  campaignId: null,
  filename: 'rules.md',
  originalName: 'rules.md',
  mimeType: 'text/markdown',
  fileSize: 1024,
  name: 'House Rules',
  description: null,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
};

vi.mock('@/hooks/queries', () => ({
  useAssetsQuery: () => ({
    data: { assets: [doc], pagination: { page: 1, limit: 24, total: 1, totalPages: 1 } },
    isLoading: false,
  }),
}));
vi.mock('@/components/assets/AssetUploadModal', () => ({ default: () => null }));

const api = vi.hoisted(() => ({
  deleteAsset: vi.fn(),
  getDocumentUrl: (id: string) => `/api/assets/documents/${id}`,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DocumentsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.deleteAsset.mockResolvedValue({ message: 'ok' });
});

describe('Documents page delete', () => {
  it('asks, then deletes a document nothing uses', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Delete House Rules' }));
    expect(api.deleteAsset).not.toHaveBeenCalled();
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete document' })).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteAsset).toHaveBeenCalledWith('doc-1'));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('"House Rules" deleted', 'success'));
  });

  it('shows where a document in use is used and forces the delete only after a second yes', async () => {
    api.deleteAsset.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          code: 'ASSET_IN_USE',
          message: 'in use',
          usage: [{ kind: 'campaignSetting', name: 'Lost Mine', campaignId: 'c1', campaignName: 'Lost Mine', count: 1 }],
          omitted: 0,
        },
      },
    });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Delete House Rules' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete document' })).getByRole('button', { name: 'Delete' }));

    const warning = await screen.findByRole('dialog', { name: 'Asset is in use' });
    expect(warning).toHaveTextContent('Ambient sound of the campaign "Lost Mine"');
    expect(showToast).not.toHaveBeenCalled();

    await userEvent.click(within(warning).getByRole('button', { name: 'Delete anyway' }));
    await waitFor(() => expect(api.deleteAsset).toHaveBeenLastCalledWith('doc-1', { force: true }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('"House Rules" deleted', 'success'));
  });

  it('shows the server reason when the delete is refused', async () => {
    api.deleteAsset.mockRejectedValueOnce({ response: { status: 403, data: { message: 'Only the owner can delete personal assets' } } });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Delete House Rules' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete document' })).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Only the owner can delete personal assets', 'error'));
  });
});
