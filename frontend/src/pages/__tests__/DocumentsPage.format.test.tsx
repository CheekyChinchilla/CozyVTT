/**
 * A document is shown as what the server serves it as.
 *
 * The upload names the stored file by what its bytes are, so a real PDF
 * uploaded as "handout.txt" is stored, and served, as a PDF. The page went by
 * the uploaded name: it labelled such a file Text, showed its bytes as text,
 * and offered Edit, which the server refused. It now goes by the stored name.
 */
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

const handout: Asset = {
  id: 'doc-7',
  type: AssetType.DOCUMENT,
  scope: AssetScope.USER,
  uploadedById: 'u1',
  campaignId: null,
  filename: '0f3c9a1e-2b7d-4c55-9e1a-7d2f6b8c4a10.pdf',
  originalName: 'handout.txt',
  mimeType: 'application/pdf',
  fileSize: 4096,
  name: 'Handout',
  description: null,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  canChange: true,
};

vi.mock('@/hooks/queries', () => ({
  useAssetsQuery: () => ({
    data: { assets: [handout], pagination: { page: 1, limit: 24, total: 1, totalPages: 1 } },
    isLoading: false,
  }),
}));
const api = vi.hoisted(() => ({
  deleteAsset: vi.fn(),
  updateDocumentContent: vi.fn(),
  getDocumentUrl: (id: string) => `/api/assets/documents/${id}`,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

it('labels and opens a PDF stored from a file named .txt as a PDF', async () => {
  // A browser that shows a PDF in the reader's frame.
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0');
  globalThis.fetch = vi.fn(async () => new Response('%PDF-1.7 binary')) as typeof fetch;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <DocumentsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  expect(screen.getByText(/^PDF · 4 KB/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Read' }));

  expect((await screen.findByTitle('Handout')).tagName).toBe('IFRAME');
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
