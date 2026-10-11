/**
 * After a restore, Go to Login opens the sign-in page.
 *
 * It sent the admin to /login, which is not a page, so they landed on the
 * welcome page and had to find the sign-in link.
 */
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  listBackups: vi.fn(),
  restoreBackup: vi.fn(),
}));
vi.mock('@/services/admin.service', () => ({ adminService }));
vi.mock('@/services/api', () => ({ api: {}, default: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  adminService.getStats.mockResolvedValue({ assetBreakdown: [], totalStorageBytes: 0 });
  adminService.listBackups.mockResolvedValue([]);
  adminService.restoreBackup.mockResolvedValue({ message: 'Restore complete.', safetyBackup: 'backup-2026-10-10T12-00-00.zip' });
});

it('points Go to Login at the sign-in page', async () => {
  render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );
  await userEvent.click(screen.getByRole('tab', { name: /Backups/ }));
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  fireEvent.change(input!, { target: { files: [new File(['zip'], 'backup.zip', { type: 'application/zip' })] } });
  await userEvent.click(await screen.findByRole('button', { name: /Restore Instance/ }));
  await userEvent.click(await screen.findByRole('button', { name: 'Restore Backup' }));

  const login = await screen.findByRole('link', { name: 'Go to Login' });
  expect(login).toHaveAttribute('href', '/auth/login');
});
