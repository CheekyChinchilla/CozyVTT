/**
 * The Admin Panel's asset table can find what only an admin can reach.
 *
 * An asset whose uploader's account was deleted, and which no campaign holds,
 * is readable by admins alone, and the table had no way to pick those out.
 * Documents were missing from the table entirely, since a list with no type
 * leaves them out. The Uploader filter asks for assets with no uploader, the
 * Type filter has Document, and the Assets tab offers the leftover files check.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Asset } from '@/types';
import { AssetScope, AssetType } from '@/types';
import AdminPage from '../AdminPage';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', displayName: 'Root', platformRole: 'ADMIN' } }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ refreshAppearance: vi.fn() }),
}));

const ownerless: Asset = {
  id: 'asset-9',
  type: AssetType.DOCUMENT,
  scope: AssetScope.USER,
  uploadedById: null,
  campaignId: null,
  filename: 'notes.md',
  originalName: 'notes.md',
  mimeType: 'text/markdown',
  fileSize: 1024,
  name: 'Old Handout',
  description: null,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  uploadedBy: null,
  campaign: null,
};

const adminService = vi.hoisted(() => ({
  getStats: vi.fn(),
}));
vi.mock('@/services/admin.service', () => ({ adminService }));

const api = vi.hoisted(() => ({
  listAssets: vi.fn(),
  adminListAllCampaigns: vi.fn(),
  getAssetUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}`,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

beforeEach(() => {
  vi.clearAllMocks();
  adminService.getStats.mockResolvedValue({ assetBreakdown: [], totalStorageBytes: 0 });
  api.listAssets.mockResolvedValue({ assets: [ownerless], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } });
  api.adminListAllCampaigns.mockResolvedValue({ campaigns: [] });
});

async function openAssets() {
  render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );
  await userEvent.click(screen.getByRole('tab', { name: 'Assets' }));
  await screen.findByText('Old Handout');
}

describe('the Admin Panel asset table', () => {
  it('asks for assets with no uploader, and says who uploaded them: no one', async () => {
    await openAssets();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Uploader' }), 'none');
    await waitFor(() => expect(api.listAssets).toHaveBeenLastCalledWith(expect.objectContaining({ uploadedBy: 'none' })));
    expect(screen.getByText('No one')).toBeInTheDocument();
  });

  it('can list documents', async () => {
    await openAssets();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Type' }), 'DOCUMENT');
    await waitFor(() => expect(api.listAssets).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'DOCUMENT' })));
  });

  it('offers the leftover files check', async () => {
    await openAssets();
    expect(screen.getByRole('button', { name: 'Check for Leftover Files' })).toBeInTheDocument();
  });
});
