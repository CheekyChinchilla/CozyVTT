/**
 * The Admin Panel asks before it deletes an asset.
 *
 * The bin on an asset row removed the file for good on one click, and blanked
 * every map or token that used it. It now opens a confirmation naming the asset,
 * its uploader and its campaign; if the server says the asset is still in use,
 * a second one lists where, and the delete is forced only after that.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Asset, User } from '@/types';
import { AssetScope, AssetType, PlatformRole } from '@/types';
import AdminPage from '../AdminPage';

const showToast = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', displayName: 'Root', platformRole: 'ADMIN' } }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ refreshAppearance: vi.fn() }),
}));

const mapAsset: Asset = {
  id: 'asset-1',
  type: AssetType.MAP,
  scope: AssetScope.CAMPAIGN,
  uploadedById: 'u-dm',
  campaignId: 'c-1',
  filename: 'cave.png',
  originalName: 'cave.png',
  mimeType: 'image/png',
  fileSize: 52_428_800,
  name: 'Goblin Cave',
  description: null,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  uploadedBy: { id: 'u-dm', displayName: 'Dana the DM' },
  campaign: { id: 'c-1', name: 'Lost Mine' },
};

const regularUser = {
  id: 'u-2', email: 'sam@example.test', displayName: 'Sam Player', platformRole: PlatformRole.USER,
  isApproved: true, mfaEnabled: false, createdAt: '2026-01-01T00:00:00.000Z', lastLoginAt: null,
} as unknown as User;
const otherAdmin = {
  ...regularUser, id: 'u-3', email: 'ada@example.test', displayName: 'Ada Admin', platformRole: PlatformRole.ADMIN,
} as unknown as User;

const adminService = vi.hoisted(() => ({
  getStats: vi.fn(),
  getUsers: vi.fn(),
  getConfig: vi.fn(),
  listBackups: vi.fn(),
  deleteBackup: vi.fn(),
  updateUser: vi.fn(),
  getBackupDownloadUrl: (name: string) => `/api/admin/backups/${name}/download`,
}));
vi.mock('@/services/admin.service', () => ({ adminService }));

const api = vi.hoisted(() => ({
  listAssets: vi.fn(),
  adminListAllCampaigns: vi.fn(),
  deleteAsset: vi.fn(),
  getAssetUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}`,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

async function openTab(name: string) {
  await userEvent.click(screen.getByRole('tab', { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  adminService.getStats.mockResolvedValue({ assetBreakdown: [], totalStorageBytes: 0 });
  adminService.getUsers.mockResolvedValue([otherAdmin, regularUser]);
  adminService.getConfig.mockResolvedValue({ smtp: { configured: false } });
  adminService.listBackups.mockResolvedValue([
    { filename: 'cozyvtt-backup-2026-01-01.zip', sizeBytes: 2048, createdAt: '2026-01-01T00:00:00.000Z' },
  ]);
  adminService.deleteBackup.mockResolvedValue(undefined);
  adminService.updateUser.mockImplementation(async (id: string, data: Partial<User>) => ({
    ...(id === 'u-2' ? regularUser : otherAdmin), ...data,
  }));
  api.listAssets.mockResolvedValue({ assets: [mapAsset], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } });
  api.adminListAllCampaigns.mockResolvedValue({ campaigns: [] });
  api.deleteAsset.mockResolvedValue({ message: 'Asset deleted successfully' });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );
}

describe('the asset bin in the Admin Panel', () => {
  it('asks first, naming the asset, its uploader and its campaign, and Cancel deletes nothing', async () => {
    renderPage();
    await openTab('Assets');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete asset Goblin Cave' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Goblin Cave');
    expect(dialog).toHaveTextContent('Dana the DM');
    expect(dialog).toHaveTextContent('Lost Mine');
    expect(api.deleteAsset).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.deleteAsset).not.toHaveBeenCalled();
    expect(screen.getByText('Goblin Cave')).toBeInTheDocument();
  });

  it('deletes after Delete is confirmed, and removes the row', async () => {
    renderPage();
    await openTab('Assets');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete asset Goblin Cave' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteAsset).toHaveBeenCalledWith('asset-1'));
    await waitFor(() => expect(screen.queryByText('Goblin Cave')).not.toBeInTheDocument());
  });

  it('shows where an asset in use is used and forces the delete only after a second yes', async () => {
    api.deleteAsset.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          error: 'Conflict',
          code: 'ASSET_IN_USE',
          message: 'This asset is still in use.',
          usage: [
            { kind: 'map', name: 'Goblin Cave', campaignId: 'c-1', campaignName: 'Lost Mine', count: 1 },
            { kind: 'token', name: 'Ambush Road', campaignId: 'c-1', campaignName: 'Lost Mine', count: 3 },
          ],
          omitted: 0,
        },
      },
    });
    renderPage();
    await openTab('Assets');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete asset Goblin Cave' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));

    const inUse = await screen.findByRole('dialog', { name: 'Asset is in use' });
    expect(inUse).toHaveTextContent('Map "Goblin Cave" (Lost Mine)');
    expect(inUse).toHaveTextContent('3 tokens on the map "Ambush Road" (Lost Mine)');
    expect(api.deleteAsset).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Goblin Cave', { selector: 'p' })).toBeInTheDocument();

    await userEvent.click(within(inUse).getByRole('button', { name: 'Delete anyway' }));

    await waitFor(() => expect(api.deleteAsset).toHaveBeenLastCalledWith('asset-1', { force: true }));
    await waitFor(() => expect(screen.queryByText('Goblin Cave', { selector: 'p' })).not.toBeInTheDocument());
  });

  it('leaves the asset alone when the in-use warning is cancelled', async () => {
    api.deleteAsset.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'ASSET_IN_USE', message: 'in use', usage: [], omitted: 0 } },
    });
    renderPage();
    await openTab('Assets');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete asset Goblin Cave' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    const inUse = await screen.findByRole('dialog', { name: 'Asset is in use' });
    await userEvent.click(within(inUse).getByRole('button', { name: 'Cancel' }));

    expect(api.deleteAsset).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Goblin Cave', { selector: 'p' })).toBeInTheDocument();
  });

  it('says so when the server refuses for another reason', async () => {
    api.deleteAsset.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Failed to delete asset' } } });
    renderPage();
    await openTab('Assets');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete asset Goblin Cave' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Failed to delete asset', 'error'));
  });
});
