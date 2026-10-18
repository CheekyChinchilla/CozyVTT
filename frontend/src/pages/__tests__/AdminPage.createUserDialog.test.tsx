/**
 * Create User and Invite User open as a dialog.
 *
 * The window was a plain overlay: a screen reader was not told a dialog had
 * opened, Tab moved into the users table behind it, and Escape did nothing.
 * It is now the app's shared dialog. While a temporary password is on screen
 * it still cannot be closed by accident, only with Done.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import AdminPage from '../AdminPage';
import { waitForDialogFocus } from '@/test/dialogFocus';

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
  getUsers: vi.fn(),
  getConfig: vi.fn(),
  createUser: vi.fn(),
}));
vi.mock('@/services/admin.service', () => ({ adminService }));
vi.mock('@/services/api', () => ({ api: {}, default: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  adminService.getStats.mockResolvedValue({ assetBreakdown: [], totalStorageBytes: 0 });
  adminService.getUsers.mockResolvedValue([]);
  adminService.getConfig.mockResolvedValue({ smtp: { configured: false } });
  adminService.createUser.mockResolvedValue({
    user: { id: 'u-9', email: 'new@example.test', displayName: 'New', platformRole: 'USER' },
    emailSent: false,
    temporaryPassword: 'ABCD-EFGH-IJKL-MNOP',
  });
});

async function openCreateUser() {
  render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );
  await userEvent.click(screen.getByRole('tab', { name: /Users/ }));
  await userEvent.click(await screen.findByRole('button', { name: /Create User/ }));
  return waitForDialogFocus(await screen.findByRole('dialog', { name: 'Create User' }));
}

describe('the Create User window', () => {
  it('is a labelled modal dialog that Escape closes', async () => {
    const dialog = await openCreateUser();
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create User' })).toBeNull());
  });

  it('cannot be closed with Escape while the temporary password is shown', async () => {
    await openCreateUser();
    await userEvent.type(screen.getByLabelText(/Email/), 'new@example.test');
    const createButtons = screen.getAllByRole('button', { name: 'Create User' });
    await userEvent.click(createButtons[createButtons.length - 1]);
    await screen.findByText('ABCD-EFGH-IJKL-MNOP');

    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('dialog', { name: 'Create User' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create User' })).toBeNull());
  });
});
