/**
 * The Activity tab's Recent Admin Actions say who acted and what changed.
 *
 * The table showed only the time, the level and the message, and the messages
 * do not name the administrator, so the log could not tell who had promoted
 * whom. Each line now names the administrator, or says the account is gone,
 * and lists the values before and after.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { AdminActivityData, AdminSystemLog } from '@/types';
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
  getActivity: vi.fn(),
}));
vi.mock('@/services/admin.service', () => ({ adminService }));
vi.mock('@/services/api', () => ({ api: {}, default: {} }));

const line = (overrides: Partial<AdminSystemLog>): AdminSystemLog => ({
  id: 'log-1',
  level: 'INFO',
  message: 'Changed the account of sam@example.com: bio changed',
  userId: 'admin-2',
  actor: { id: 'admin-2', email: 'morgan@example.com', displayName: 'Morgan' },
  context: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

const activityWith = (recentLogs: AdminSystemLog[]): AdminActivityData => ({
  recentUsers: [],
  recentSessions: [],
  onlineUsers: [],
  recentLogs,
});

async function openActivity(recentLogs: AdminSystemLog[]) {
  adminService.getActivity.mockResolvedValue(activityWith(recentLogs));
  render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );
  await userEvent.click(screen.getByRole('tab', { name: /Activity/ }));
  const heading = await screen.findByRole('heading', { name: 'Recent Admin Actions' });
  return heading.closest('section') as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  adminService.getStats.mockResolvedValue({ assetBreakdown: [], totalStorageBytes: 0 });
  adminService.getHealth.mockResolvedValue({ status: 'healthy', services: { api: 'ok', database: 'ok', websocket: 'ok' }, connections: 0 });
});

describe('Recent Admin Actions', () => {
  it('names the administrator who acted', async () => {
    const section = await openActivity([line({})]);

    expect(within(section).getByRole('columnheader', { name: 'By' })).toBeInTheDocument();
    const row = within(section).getByText(/Changed the account of sam@example.com/).closest('tr') as HTMLElement;
    expect(within(row).getByText('Morgan')).toBeInTheDocument();
    expect(within(row).getByText('morgan@example.com')).toBeInTheDocument();
  });

  it("says when the administrator's account has been deleted, and names no one for the instance's own lines", async () => {
    const section = await openActivity([
      line({ id: 'gone', message: 'Deleted the account of kit@example.com', userId: 'admin-9', actor: null }),
      line({ id: 'instance', message: 'Sign-ins to kit@example.com locked', userId: null, actor: null }),
    ]);

    const gone = within(section).getByText('Deleted the account of kit@example.com').closest('tr') as HTMLElement;
    expect(within(gone).getByText('Deleted account')).toBeInTheDocument();
    const instance = within(section).getByText('Sign-ins to kit@example.com locked').closest('tr') as HTMLElement;
    expect(within(instance).getByText('The instance')).toBeInTheDocument();
  });

  it('lists each value before and after', async () => {
    const section = await openActivity([
      line({
        context: {
          targetUserId: 'user-3',
          changes: {
            bio: { from: 'Likes dragons', to: 'Likes owlbears' },
            globalAssetManager: { from: false, to: true },
            avatarUrl: { from: '/uploads/avatars/a.png', to: null },
          },
        },
      }),
    ]);

    await userEvent.click(within(section).getByText('What changed'));

    expect(within(section).getByText('What changed').closest('details')).toHaveAttribute('open');
    expect(within(section).getByText('Bio: was "Likes dragons", now "Likes owlbears"')).toBeVisible();
    expect(within(section).getByText('Global Assets: was no, now yes')).toBeVisible();
    expect(within(section).getByText('Avatar: was "/uploads/avatars/a.png", now none')).toBeVisible();
  });

  it('lists the new values of a settings change', async () => {
    const section = await openActivity([
      line({
        message: 'Updated system settings: instanceName, allowRegistration',
        context: { changes: { instanceName: 'Friday Night Table', allowRegistration: false } },
      }),
    ]);

    await userEvent.click(within(section).getByText('What changed'));

    expect(within(section).getByText('Instance Name: now "Friday Night Table"')).toBeVisible();
    expect(within(section).getByText('Allow Public Registration: now no')).toBeVisible();
  });

  it('has nothing to open for a line with no changes', async () => {
    const section = await openActivity([line({ message: 'Sent a password reset link to sam@example.com', context: { targetUserId: 'user-3' } })]);

    expect(within(section).queryByText('What changed')).toBeNull();
  });
});
