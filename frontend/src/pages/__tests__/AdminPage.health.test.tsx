/**
 * The dashboard's status card says what the server says about itself.
 *
 * It always said Healthy, with the API, database and live connections all
 * green, beside an error saying the numbers could not be loaded. It now asks
 * the server (GET /api/admin/health) and shows each part as it is, or that it
 * could not tell.
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

/** An axios-shaped failure: with a status when the server answered, without one when it did not. */
const failure = (status?: number) =>
  Object.assign(new Error('Request failed'), status ? { response: { status, data: { error: 'Internal Server Error', message: 'Failed to fetch stats' } } } : {});

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
    expect(screen.getByLabelText('DB: working')).toBeInTheDocument();
    expect(screen.getByLabelText('WS: working')).toBeInTheDocument();
  });

  it('shows the database as down when the server says so', async () => {
    adminService.getStats.mockRejectedValue(failure(500));
    adminService.getHealth.mockResolvedValue({ status: 'degraded', services: { api: 'ok', database: 'error', websocket: 'ok' }, connections: 0 });

    renderPage();

    expect(await screen.findByText('Degraded')).toBeInTheDocument();
    expect(screen.getByLabelText('DB: down')).toBeInTheDocument();
    expect(screen.queryByText('Healthy')).toBeNull();
  });

  it('does not claim anything when the server cannot be asked', async () => {
    adminService.getStats.mockRejectedValue(failure());
    adminService.getHealth.mockRejectedValue(failure());

    renderPage();

    expect(await screen.findByText('Unknown')).toBeInTheDocument();
    expect(screen.getByLabelText('API: down')).toBeInTheDocument();
    expect(screen.getByLabelText('DB: not known')).toBeInTheDocument();
    expect(screen.queryByText('Healthy')).toBeNull();
  });
});
