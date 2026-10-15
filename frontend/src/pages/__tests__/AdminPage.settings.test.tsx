/**
 * The Admin Panel's Settings tab.
 *
 * Instance Name is shown in the browser tab, so saving it repaints the
 * title at once. Timezone was a setting nothing used, and is gone.
 *
 * When the settings cannot be loaded, the Settings and Appearance tabs show
 * the error and a Retry button, not a form. The form used to appear filled
 * with placeholder defaults, and saving it wrote them over the instance's
 * real settings: registration closed, approval switched on, the name blank.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { AdminSystemSettings } from '@/types';
import AdminPage from '../AdminPage';

const refreshAppearance = vi.fn(async () => undefined);
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', displayName: 'Root', platformRole: 'ADMIN' } }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ refreshAppearance }),
}));

const SETTINGS: AdminSystemSettings = {
  id: 's1', instanceName: 'Friday Night Table', timezone: 'UTC', allowRegistration: true, requireAdminApproval: false,
  themeId: 'cozy-default', customThemeColors: null, fontId: 'default',
  customLogoUrl: null, customFaviconUrl: null, customMascotUrl: null,
};

const adminService = vi.hoisted(() => ({
  getStats: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  getConfig: vi.fn(),
}));
vi.mock('@/services/admin.service', () => ({ adminService }));
vi.mock('@/services/api', () => ({ api: {}, default: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  adminService.getStats.mockResolvedValue({ assetBreakdown: [], totalStorageBytes: 0 });
  adminService.getSettings.mockResolvedValue(SETTINGS);
  adminService.updateSettings.mockImplementation(async (body: Partial<AdminSystemSettings>) => ({ ...SETTINGS, ...body }));
  adminService.getConfig.mockResolvedValue({ smtp: { configured: false }, uploadLimits: {}, sessionTimeoutMs: 0, rememberMeTimeoutMs: 0 });
});

async function openSettings() {
  render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );
  await userEvent.click(screen.getByRole('tab', { name: /Settings/ }));
  return (await screen.findByDisplayValue('Friday Night Table')) as HTMLInputElement;
}

describe('the Settings tab', () => {
  it('has no Timezone setting', async () => {
    await openSettings();

    expect(screen.queryByText('Timezone')).toBeNull();
  });

  it('saves the instance name without a timezone, and repaints the page title', async () => {
    const name = await openSettings();
    await userEvent.clear(name);
    await userEvent.type(name, 'The Hearthstone Tavern');

    await userEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    await waitFor(() => expect(adminService.updateSettings).toHaveBeenCalledTimes(1));
    expect(adminService.updateSettings.mock.calls[0][0]).toMatchObject({ instanceName: 'The Hearthstone Tavern' });
    expect(adminService.updateSettings.mock.calls[0][0]).not.toHaveProperty('timezone');
    await waitFor(() => expect(refreshAppearance).toHaveBeenCalled());
  });
});

describe('settings that could not be loaded', () => {
  const failure = () => Object.assign(new Error('Request failed'), { response: { status: 500, data: { error: 'Internal Server Error', message: 'Failed to fetch settings' } } });

  it('show the error and Retry on the Settings tab, with nothing to save', async () => {
    adminService.getSettings.mockRejectedValueOnce(failure());
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole('tab', { name: /Settings/ }));

    expect(await screen.findByText('Failed to fetch settings')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Settings' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByDisplayValue('Friday Night Table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeInTheDocument();
    expect(adminService.updateSettings).not.toHaveBeenCalled();
  });

  it('show the error and Retry on the Appearance tab, with nothing to save', async () => {
    adminService.getSettings.mockRejectedValueOnce(failure());
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );
    await userEvent.click(screen.getByRole('tab', { name: /Appearance/ }));

    expect(await screen.findByText('Failed to fetch settings')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Default Theme' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
