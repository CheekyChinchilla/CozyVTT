/**
 * The dashboard warns when the disk holding the uploads is nearly full.
 *
 * No per-user storage quota is enforced, so one account can fill the disk
 * the uploads share with the backups and, on most installs, the database.
 * Over 80% full, the System Overview says so and what to do.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

const adminService = vi.hoisted(() => ({
  getStats: vi.fn(),
  getHealth: vi.fn(),
}));
vi.mock('@/services/admin.service', () => ({ adminService }));
vi.mock('@/services/api', () => ({ api: {}, default: {} }));

const GB = 1024 * 1024 * 1024;
const statsWith = (usedPercent: number, freeBytes: number) => ({
  assetBreakdown: [],
  totalStorageBytes: 0,
  uploadsDisk: { totalBytes: 100 * GB, freeBytes, usedPercent, warning: usedPercent > 80 },
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  adminService.getHealth.mockResolvedValue({ status: 'healthy', services: { api: 'ok', database: 'ok', websocket: 'ok' }, connections: 1 });
});

describe('the disk warning', () => {
  it('appears when the disk holding the uploads is over 80% full', async () => {
    adminService.getStats.mockResolvedValue(statsWith(87, 13 * GB));
    renderPage();

    const warning = await screen.findByRole('alert', { name: 'Disk nearly full' });
    expect(warning).toHaveTextContent('The disk that holds your uploads is 87% full');
    expect(warning).toHaveTextContent('13.0 GB free');
  });

  it('does not appear at 80% or under, and the free space is shown', async () => {
    adminService.getStats.mockResolvedValue(statsWith(42, 58 * GB));
    renderPage();

    expect(await screen.findByText('58.0 GB free on disk')).toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: 'Disk nearly full' })).toBeNull();
  });
});
