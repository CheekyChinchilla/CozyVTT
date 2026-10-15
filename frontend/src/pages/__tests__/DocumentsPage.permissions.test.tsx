/**
 * Who the Documents page offers Edit and Delete to.
 *
 * Whether a document may be changed turns on facts the page does not have:
 * whether its uploader still manages global assets, or who runs the campaign
 * it belongs to. The page offered both to an admin and to the document's
 * uploader, so the uploader of a global document who no longer manages
 * global assets was offered them and refused, and the DM of a campaign was
 * not offered them on that campaign's own documents, which they may change.
 * The asset list now says, for each asset, whether the server will take a
 * change from this user, and both are offered on that alone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Asset } from '@/types';
import { AssetScope, AssetType } from '@/types';
import DocumentsPage from '../DocumentsPage';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', platformRole: 'USER', globalAssetManager: false } }),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/components/assets/AssetUploadModal', () => ({ default: () => null }));

const listed = vi.hoisted(() => ({ assets: [] as Asset[] }));
vi.mock('@/hooks/queries', () => ({
  useAssetsQuery: () => ({
    data: { assets: listed.assets, pagination: { page: 1, limit: 24, total: listed.assets.length, totalPages: 1 } },
    isLoading: false,
  }),
}));

const api = vi.hoisted(() => ({
  deleteAsset: vi.fn(),
  updateDocumentContent: vi.fn(),
  getDocumentUrl: (id: string) => `/api/assets/documents/${id}`,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

function doc(fields: Partial<Asset>): Asset {
  return {
    id: 'doc-1',
    type: AssetType.DOCUMENT,
    scope: AssetScope.GLOBAL,
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
    ...fields,
  };
}

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

/** Opens the reader on `name` and waits for its text to load. */
async function openReader(name: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Read' }));
  await waitFor(() => expect(screen.getAllByText(name).length).toBeGreaterThan(1));
  await screen.findByText('Notes');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('# Notes', { status: 200 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Documents page: who is offered Edit and Delete', () => {
  // The server answers 403 to such a delete and 404 to such an edit.
  it('offers neither on a global document to its uploader once the server says they may not change it', async () => {
    listed.assets = [doc({ scope: AssetScope.GLOBAL, uploadedById: 'u1', canChange: false })];
    renderPage();
    expect(screen.queryByRole('button', { name: 'Delete House Rules' })).not.toBeInTheDocument();
    await openReader('House Rules');
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it("offers both on a campaign's own document to its DM, whoever uploaded it", async () => {
    listed.assets = [doc({ scope: AssetScope.CAMPAIGN, campaignId: 'c1', uploadedById: 'cohost', canChange: true })];
    renderPage();
    expect(screen.getByRole('button', { name: 'Delete House Rules' })).toBeInTheDocument();
    await openReader('House Rules');
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
  });

  it('offers neither when the list does not say', async () => {
    listed.assets = [doc({ scope: AssetScope.USER, uploadedById: 'u1' })];
    renderPage();
    expect(screen.queryByRole('button', { name: 'Delete House Rules' })).not.toBeInTheDocument();
    await openReader('House Rules');
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument();
  });
});
