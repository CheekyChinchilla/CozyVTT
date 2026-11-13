/**
 * The dashboard's status card says what the server says about itself.
 *
 * It always said Healthy, with the API, database and live connections all
 * green, beside an error saying the numbers could not be loaded. It now asks
 * the server (GET /api/admin/health) and shows the API and the database as
 * they are, or that it could not tell. Live connections are the browser's own
 * check (AdminPage.liveConnection.test.tsx).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import AdminPage from '../AdminPage';
import type { LiveConnectionState } from '@/services/liveConnectionCheck';

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
// The browser's own check of live connections, which has its tests in
// AdminPage.liveConnection.test.tsx, finds them working here.
vi.mock('@/services/liveConnectionCheck', () => ({
  checkLiveConnection: (report: (state: LiveConnectionState) => void) => {
    report('working');
    return () => undefined;
  },
}));

/** An axios-shaped failure: with a status when the server answered, without one when it did not. */
const failure = (status?: number) =>
  Object.assign(new Error('Request failed'), status ? { response: { status, data: { error: 'Internal Server Error', message: 'Failed to fetch stats' } } } : {});

/** What a row of the status card says, after its label. */
const part = (label: string) => screen.getByText(label).parentElement?.textContent?.slice(label.length).trim();

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  adminService.getStats.mockResolvedValue({ assetBreakdown: [], totalStorageBytes: 0 });
});

describe('the status card', () => {
  it('says Healthy only when every part says so', async () => {
    adminService.getHealth.mockResolvedValue({ status: 'healthy', services: { api: 'ok', database: 'ok', websocket: 'ok' }, connections: 3 });

    renderPage();

    expect(await screen.findByText('Healthy')).toBeInTheDocument();
    expect(part('API')).toBe('Working');
    expect(part('DB')).toBe('Working');
    expect(part('WS')).toBe('Working');
  });

  it('shows the database as down when the server says so', async () => {
    adminService.getStats.mockRejectedValue(failure(500));
    adminService.getHealth.mockResolvedValue({ status: 'degraded', services: { api: 'ok', database: 'error', websocket: 'ok' }, connections: 0 });

    renderPage();

    expect(await screen.findByText('Degraded')).toBeInTheDocument();
    expect(part('DB')).toBe('Down');
    expect(screen.queryByText('Healthy')).toBeNull();
  });

  it('does not claim anything when the server cannot be asked', async () => {
    adminService.getStats.mockRejectedValue(failure());
    adminService.getHealth.mockRejectedValue(failure());

    renderPage();

    expect(await screen.findByText('Unknown')).toBeInTheDocument();
    expect(part('API')).toBe('Down');
    expect(part('DB')).toBe('Not known');
    expect(screen.queryByText('Healthy')).toBeNull();
  });
});
