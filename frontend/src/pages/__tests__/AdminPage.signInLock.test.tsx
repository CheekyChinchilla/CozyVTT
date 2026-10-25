/**
 * The Admin Panel's user list shows an account's sign-in lock and clears it.
 *
 * Ten wrong passwords in an hour lock an account, and the only ways to open
 * it were to wait or to set a new password. A locked account's row now says
 * until when, and **Clear lock** opens it after asking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { AdminListedUser } from '@/types';
import { PlatformRole } from '@/types';
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

const LOCKED_UNTIL = '2026-10-19T14:05:00.000Z';
const lockedTime = new Date(LOCKED_UNTIL).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const sam = {
  id: 'u-2', email: 'sam@example.test', displayName: 'Sam Player', platformRole: PlatformRole.USER,
  isApproved: true, mfaEnabled: false, createdAt: '2026-01-01T00:00:00.000Z', lastLoginAt: null,
  signInLockedUntil: LOCKED_UNTIL,
} as unknown as AdminListedUser;
const kim = {
  ...sam, id: 'u-3', email: 'kim@example.test', displayName: 'Kim Player', signInLockedUntil: null,
} as unknown as AdminListedUser;

const adminService = vi.hoisted(() => ({
  getStats: vi.fn(),
  getUsers: vi.fn(),
  getConfig: vi.fn(),
  clearSignInLock: vi.fn(),
}));
vi.mock('@/services/admin.service', () => ({ adminService }));

const api = vi.hoisted(() => ({
  listAssets: vi.fn(),
}));
vi.mock('@/services/api', () => ({ api, default: api }));

beforeEach(() => {
  vi.clearAllMocks();
  adminService.getStats.mockResolvedValue({ assetBreakdown: [], totalStorageBytes: 0 });
  adminService.getUsers.mockResolvedValue([sam, kim]);
  adminService.getConfig.mockResolvedValue({ smtp: { configured: false } });
  adminService.clearSignInLock.mockResolvedValue(undefined);
});

async function usersTab() {
  render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );
  await userEvent.click(screen.getByRole('tab', { name: 'Users' }));
  const row = (name: string) => screen.getByText(name).closest('tr')!;
  await screen.findByText('Sam Player');
  return row;
}

describe('a sign-in lock in the user list', () => {
  it('shows when a locked account opens again, and offers Clear lock on that row alone', async () => {
    const row = await usersTab();

    expect(within(row('Sam Player')).getByText(`Locked until ${lockedTime}`)).toBeInTheDocument();
    expect(within(row('Sam Player')).getByRole('button', { name: 'Clear lock' })).toBeInTheDocument();
    expect(within(row('Kim Player')).queryByText(/Locked until/)).toBeNull();
    expect(within(row('Kim Player')).queryByRole('button', { name: 'Clear lock' })).toBeNull();
  });

  it('asks first, naming the account, and Cancel clears nothing', async () => {
    const row = await usersTab();
    await userEvent.click(within(row('Sam Player')).getByRole('button', { name: 'Clear lock' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Sam Player');
    expect(dialog).toHaveTextContent('sam@example.test');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(adminService.clearSignInLock).not.toHaveBeenCalled();
    expect(within(row('Sam Player')).getByText(`Locked until ${lockedTime}`)).toBeInTheDocument();
  });

  it('clears the lock once confirmed, and the badge goes', async () => {
    const row = await usersTab();
    await userEvent.click(within(row('Sam Player')).getByRole('button', { name: 'Clear lock' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Clear lock' }));

    await waitFor(() => expect(adminService.clearSignInLock).toHaveBeenCalledWith('u-2'));
    await waitFor(() => expect(within(row('Sam Player')).queryByText(/Locked until/)).toBeNull());
    expect(within(row('Sam Player')).queryByRole('button', { name: 'Clear lock' })).toBeNull();
    expect(showToast).toHaveBeenCalledWith('Sign-in lock cleared for Sam Player', 'success');
  });

  it('keeps the badge and says why when the server refuses', async () => {
    adminService.clearSignInLock.mockRejectedValueOnce({ response: { status: 404, data: { message: 'User not found' } } });
    const row = await usersTab();
    await userEvent.click(within(row('Sam Player')).getByRole('button', { name: 'Clear lock' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Clear lock' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('User not found', 'error'));
    expect(within(row('Sam Player')).getByText(`Locked until ${lockedTime}`)).toBeInTheDocument();
  });
});
