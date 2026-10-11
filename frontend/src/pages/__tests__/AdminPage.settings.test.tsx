/**
 * The Admin Panel's Settings tab.
 *
 * Instance Name is shown in the browser tab, so saving it repaints the
 * title at once. Timezone was a setting nothing used, and is gone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
