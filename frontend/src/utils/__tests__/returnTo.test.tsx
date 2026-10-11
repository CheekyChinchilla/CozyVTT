/**
 * After signing in, the app goes back to the page that asked for it.
 *
 * Opening a campaign link while signed out, or losing the sign-in on a page,
 * ended on the dashboard after signing in, and the page had to be found
 * again. The sign-in page now carries the page asked for (`next`) through
 * the password and code steps and goes back there. Only a path on this site
 * is followed, so a link cannot use the sign-in page to send someone to
 * another site.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { safeReturnPath, signInPath } from '../returnTo';

const auth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth() }));
const loadPage = vi.fn();
vi.mock('@/services/pageLoad', () => ({ loadPage: (url: string) => loadPage(url) }));

import ProtectedRoute from '@/components/ProtectedRoute';
import LoginPage from '@/pages/auth/LoginPage';
import MFAVerifyPage from '@/pages/auth/MFAVerifyPage';
import { api } from '@/services/api';

function Where() {
  const location = useLocation();
  return <p>at {location.pathname}{location.search}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/campaigns/:id" element={<ProtectedRoute><p>Campaign page</p></ProtectedRoute>} />
        <Route path="/auth/login" element={<><LoginPage /><Where /></>} />
        <Route path="/auth/mfa-verify" element={<><MFAVerifyPage /><Where /></>} />
        <Route path="/dashboard" element={<p>Dashboard</p>} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

const signedOut = { user: null, loading: false, authenticated: false, mfaPending: false, mustChangePassword: false, login: vi.fn() };
const signedIn = {
  ...signedOut,
  authenticated: true,
  user: { id: 'u1', platformRole: 'USER', adminMfaDeadline: null },
  verifyMFA: vi.fn(),
  verifyMFAWithBackupCode: vi.fn(),
  cancelMFA: vi.fn(),
};

beforeEach(() => {
  auth.mockReset();
  loadPage.mockReset();
});

describe('safeReturnPath', () => {
  it.each([
    ['/campaigns/abc', '/campaigns/abc'],
    ['/campaigns/abc?tab=maps', '/campaigns/abc?tab=maps'],
    ['/characters/c1/edit', '/characters/c1/edit'],
  ])('keeps a path on this site: %s', (value, expected) => {
    expect(safeReturnPath(value)).toBe(expected);
  });

  it.each([
    ['another site', 'https://evil.example/phish'],
    ['a protocol-relative address', '//evil.example/phish'],
    ['a backslash the browser reads as a slash', '/\\evil.example'],
    ['a tab the browser drops', '/\t/evil.example'],
    ['a script', 'javascript:alert(1)'],
    ['the sign-in page itself', '/auth/login?next=/dashboard'],
    ['a page anyone can open', '/reset-password?token=abc'],
    ['nothing', ''],
    ['no value', null],
  ])('refuses %s', (_name, value) => {
    expect(safeReturnPath(value)).toBeNull();
  });

  it('builds the sign-in path with the page to come back to', () => {
    expect(signInPath('/campaigns/abc?tab=maps')).toBe('/auth/login?next=%2Fcampaigns%2Fabc%3Ftab%3Dmaps');
    expect(signInPath('/dashboard')).toBe('/auth/login');
    expect(signInPath('//evil.example')).toBe('/auth/login');
  });
});

describe('opening a page while signed out', () => {
  it('goes to the sign-in page carrying the page asked for', () => {
    auth.mockReturnValue(signedOut);
    renderAt('/campaigns/abc');

    expect(screen.getByText('at /auth/login?next=%2Fcampaigns%2Fabc')).toBeInTheDocument();
  });
});

describe('the sign-in page', () => {
  it('goes back to the page asked for once signed in', () => {
    auth.mockReturnValue(signedIn);
    renderAt('/auth/login?next=%2Fcampaigns%2Fabc');

    expect(screen.getByText('Campaign page')).toBeInTheDocument();
  });

  it('goes to the dashboard when the page asked for is on another site', () => {
    auth.mockReturnValue(signedIn);
    renderAt('/auth/login?next=%2F%2Fevil.example');

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('carries the page asked for to the code step', () => {
    auth.mockReturnValue({ ...signedOut, mfaPending: true, verifyMFA: vi.fn(), verifyMFAWithBackupCode: vi.fn(), cancelMFA: vi.fn() });
    renderAt('/auth/login?next=%2Fcampaigns%2Fabc');

    expect(screen.getByText('at /auth/mfa-verify?next=%2Fcampaigns%2Fabc')).toBeInTheDocument();
  });
});

describe('the code page', () => {
  it('goes back to the page asked for once the code is accepted', () => {
    auth.mockReturnValue(signedIn);
    renderAt('/auth/mfa-verify?next=%2Fcampaigns%2Fabc');

    expect(screen.getByText('Campaign page')).toBeInTheDocument();
  });
});

describe('losing the sign-in on a page', () => {
  const client = (api as unknown as { client: AxiosInstance }).client;
  const originalAdapter = client.defaults.adapter;
  afterEach(() => {
    client.defaults.adapter = originalAdapter;
    window.history.pushState({}, '', '/');
  });

  it('sends the page to sign in carrying where it was', async () => {
    window.history.pushState({}, '', '/campaigns/abc?tab=maps');
    client.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
        status: 401, statusText: 'Unauthorized', data: { error: 'Unauthorized', message: 'You must be logged in to access this resource' }, headers: {}, config,
      });
    };

    await expect(api.listCampaigns()).rejects.toBeInstanceOf(AxiosError);

    expect(loadPage).toHaveBeenCalledWith('/auth/login?next=%2Fcampaigns%2Fabc%3Ftab%3Dmaps');
  });
});
