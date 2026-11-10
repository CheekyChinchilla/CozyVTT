/**
 * A backup the Admin Panel's restore would refuse is said to be one when it
 * is made.
 *
 * Create Backup reported every backup as made, and only the restore refused
 * one past its limits, so an admin learned it on the day they needed it. The
 * server now answers such a backup with a warning, which the panel shows.
 */
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import AdminPage from '../AdminPage';

const showToast = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', displayName: 'Root', platformRole: 'ADMIN' } }),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ refreshAppearance: vi.fn() }) }));

const pending = () => new Promise<never>(() => {});
const adminService = vi.hoisted(() => ({
  getStats: vi.fn(), getHealth: vi.fn(), getActivity: vi.fn(), getUsers: vi.fn(), getConfig: vi.fn(),
  getSettings: vi.fn(), listBackups: vi.fn(), createBackup: vi.fn(), getBackupDownloadUrl: vi.fn(() => '#'),
}));
vi.mock('@/services/admin.service', () => ({ adminService }));
// The status card's check of live connections would open a real socket.
vi.mock('@/services/liveConnectionCheck', () => ({ checkLiveConnection: () => () => undefined }));
vi.mock('@/services/api', () => ({
  api: { listAssets: () => new Promise<never>(() => {}), adminListAllCampaigns: () => new Promise<never>(() => {}) },
  default: {},
}));

const WARNING = 'The Admin Panel\'s restore would refuse this backup: it holds 120,000 files, more than the 100,000 the restore takes. It is kept: restore it from the command line, as the deployment guide\'s "To restore anyway" describes.';

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [adminService.getStats, adminService.getHealth, adminService.getActivity, adminService.getUsers, adminService.getConfig, adminService.getSettings]) {
    fn.mockImplementation(pending);
  }
  adminService.listBackups.mockResolvedValue([]);
});

async function createBackup() {
  render(<MemoryRouter><AdminPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('tab', { name: /Backups/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Create Backup/ }));
}

it('shows the warning a backup past the restore\'s limits comes with, and lists the backup', async () => {
  adminService.createBackup.mockResolvedValue({ filename: 'backup-2026-11-03T12-00-00.zip', sizeBytes: 5_000, createdAt: '2026-11-03T12:00:00.000Z', warning: WARNING });
  await createBackup();
  await waitFor(() => expect(showToast).toHaveBeenCalledWith(WARNING, 'warning', expect.any(Number)));
  expect(await screen.findByText('backup-2026-11-03T12-00-00.zip')).toBeInTheDocument();
});

it('says nothing more for a backup the restore would take', async () => {
  adminService.createBackup.mockResolvedValue({ filename: 'backup-2026-11-03T12-00-01.zip', sizeBytes: 5_000, createdAt: '2026-11-03T12:00:01.000Z' });
  await createBackup();
  expect(await screen.findByText('backup-2026-11-03T12-00-01.zip')).toBeInTheDocument();
  expect(showToast).not.toHaveBeenCalledWith(expect.anything(), 'warning', expect.anything());
});
