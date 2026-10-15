/**
 * Deleting a user from the Admin Panel says what happens to their files.
 *
 * The warning said a user's personal files all stay, owned by no one. Their
 * avatar and the personal files nothing uses are now deleted with the
 * account, and the count includes their personal documents, which it left
 * out.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { User } from '@/types';
import { PlatformRole } from '@/types';
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

const sam = {
  id: 'u-2', email: 'sam@example.test', displayName: 'Sam Player', platformRole: PlatformRole.USER,
  isApproved: true, mfaEnabled: false, createdAt: '2026-01-01T00:00:00.000Z', lastLoginAt: null,
} as unknown as User;

const adminService = vi.hoisted(() => ({
  getStats: vi.fn(),
  getUsers: vi.fn(),
  getConfig: vi.fn(),
}));
vi.mock('@/services/admin.service', () => ({ adminService }));

const api = vi.hoisted(() => ({
  listAssets: vi.fn(),
}));
vi.mock('@/services/api', () => ({ api, default: api }));

beforeEach(() => {
  vi.clearAllMocks();
  adminService.getStats.mockResolvedValue({ assetBreakdown: [], totalStorageBytes: 0 });
  adminService.getUsers.mockResolvedValue([sam]);
  adminService.getConfig.mockResolvedValue({ smtp: { configured: false } });
  // Three personal pictures and two personal documents.
  api.listAssets.mockImplementation(async (params: { type?: string }) => ({
    assets: [],
    pagination: { page: 1, limit: 1, total: params.type === 'DOCUMENT' ? 2 : 3, totalPages: 1 },
  }));
});

describe('deleting a user from the Admin Panel', () => {
  it('counts their personal files, documents included, and says which go and which stay', async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Users' }));
    const row = (await screen.findByText('Sam Player')).closest('tr')!;
    await userEvent.click(within(row).getByTitle('Delete user'));

    expect(api.listAssets).toHaveBeenCalledWith(expect.objectContaining({ uploadedBy: 'u-2', scope: 'USER', type: 'DOCUMENT' }));
    const warning = await screen.findByText(/personal files/);
    expect(warning).toHaveTextContent('This user has 5 personal files.');
    expect(warning).toHaveTextContent('Their avatar, and any of them nothing uses and no campaign shares, are deleted with the account.');
  });
});
