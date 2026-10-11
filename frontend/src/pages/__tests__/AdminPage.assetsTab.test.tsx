/**
 * The Admin Panel's Assets tab lists what its filters say.
 *
 * Coming back to the tab reloaded an unfiltered first page while the filters
 * still showed the old choices and the footer said "(filtered)", so a row
 * acted on could be one the admin believed filtered out. Answers arriving out
 * of order could also leave a list that matched no filter. The tab now reloads
 * with its filters, and only the newest answer is shown. A failed scope change
 * shows the server's sentence, not its short label.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { Asset } from '@/types';
import { AssetScope, AssetType } from '@/types';
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

const asset = (id: string, name: string, scope: AssetScope): Asset => ({
  id,
  type: AssetType.MAP,
  scope,
  uploadedById: 'u-1',
  campaignId: null,
  filename: `${id}.png`,
  originalName: `${id}.png`,
  mimeType: 'image/png',
  fileSize: 1024,
  name,
  description: null,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  uploadedBy: { id: 'u-1', displayName: 'Uploader' },
  campaign: null,
});

const everything = [asset('a-1', 'Personal Cave', AssetScope.USER), asset('a-2', 'Global Forest', AssetScope.GLOBAL)];
const page = (assets: Asset[]) => ({ assets, pagination: { page: 1, limit: 25, total: assets.length, totalPages: 1 } });

const adminService = vi.hoisted(() => ({
  getStats: vi.fn(),
  getUsers: vi.fn(),
  getConfig: vi.fn(),
}));
vi.mock('@/services/admin.service', () => ({ adminService }));

const api = vi.hoisted(() => ({
  listAssets: vi.fn(),
  adminListAllCampaigns: vi.fn(),
  patchAssetScope: vi.fn(),
  getAssetUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}`,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

beforeEach(() => {
  vi.clearAllMocks();
  adminService.getStats.mockResolvedValue({ assetBreakdown: [], totalStorageBytes: 0 });
  adminService.getUsers.mockResolvedValue([]);
  adminService.getConfig.mockResolvedValue({ smtp: { configured: false } });
  api.adminListAllCampaigns.mockResolvedValue({ campaigns: [] });
  api.listAssets.mockImplementation(async (params: { scope?: string }) =>
    page(params.scope ? everything.filter((a) => a.scope === params.scope) : everything));
});

/** The scope filter above the table (each row has a scope picker of its own). */
const scopeFilter = () => screen.getByRole('option', { name: 'All Scopes' }).closest('select') as HTMLSelectElement;

async function openAssets() {
  render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );
  await userEvent.click(screen.getByRole('tab', { name: 'Assets' }));
  await screen.findByText('Personal Cave');
}

describe('the Assets tab', () => {
  it('keeps its filter when the admin comes back to it', async () => {
    await openAssets();
    await userEvent.selectOptions(scopeFilter(), 'GLOBAL');
    await waitFor(() => expect(screen.queryByText('Personal Cave')).toBeNull());

    await userEvent.click(screen.getByRole('tab', { name: 'Users' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Assets' }));

    await waitFor(() => expect(api.listAssets).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'GLOBAL' })));
    expect(scopeFilter().value).toBe('GLOBAL');
    expect(await screen.findByText('Global Forest')).toBeInTheDocument();
    expect(screen.queryByText('Personal Cave')).toBeNull();
  });

  it('shows the newest answer when an older one arrives last', async () => {
    const answers: { scope?: string; resolve: (value: ReturnType<typeof page>) => void }[] = [];
    await openAssets();
    api.listAssets.mockImplementation((params: { scope?: string }) =>
      new Promise((resolve) => { answers.push({ scope: params.scope, resolve }); }));

    await userEvent.selectOptions(scopeFilter(), 'USER');
    await userEvent.selectOptions(scopeFilter(), 'GLOBAL');
    await waitFor(() => expect(answers.map((a) => a.scope)).toEqual(expect.arrayContaining(['USER', 'GLOBAL'])));

    const last = <T,>(items: T[]): T => items[items.length - 1];
    const newest = last(answers.filter((a) => a.scope === 'GLOBAL'));
    const older = last(answers.filter((a) => a.scope === 'USER'));
    await act(async () => newest.resolve(page(everything.filter((a) => a.scope === AssetScope.GLOBAL))));
    await act(async () => older.resolve(page(everything.filter((a) => a.scope === AssetScope.USER))));

    expect(screen.getByText('Global Forest')).toBeInTheDocument();
    expect(screen.queryByText('Personal Cave')).toBeNull();
  });

  it("shows the server's sentence when a scope change fails", async () => {
    api.patchAssetScope.mockRejectedValue(
      Object.assign(new Error('Request failed'), { response: { status: 404, data: { error: 'Not Found', message: 'Asset not found' } } })
    );
    await openAssets();

    await userEvent.selectOptions(screen.getAllByTitle('Change scope')[0], 'GLOBAL');

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Asset not found', 'error'));
  });
});
