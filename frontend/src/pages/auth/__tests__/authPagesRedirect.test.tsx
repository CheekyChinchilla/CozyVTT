/**
 * The sign-up and two-factor code pages send a signed-in visitor on.
 *
 * Both called navigate() while rendering, which react-router ignores on a
 * component's first render. A signed-in user who pressed Back onto either
 * page after signing in was left on a blank page, since nothing re-rendered
 * it. They now redirect the way the sign-in page does.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const auth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth() }));

import RegisterPage from '../RegisterPage';
import MFAVerifyPage from '../MFAVerifyPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/mfa-verify" element={<MFAVerifyPage />} />
        <Route path="/auth/login" element={<p>Login page</p>} />
        <Route path="/dashboard" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  auth.mockReset();
});

describe('a signed-in visitor', () => {
  it('on the sign-up page goes to the dashboard', () => {
    auth.mockReturnValue({ authenticated: true, loading: false, register: vi.fn() });
    renderAt('/auth/register');

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('on the two-factor code page goes to the dashboard', () => {
    auth.mockReturnValue({ authenticated: true, mfaPending: false, verifyMFA: vi.fn(), verifyMFAWithBackupCode: vi.fn(), cancelMFA: vi.fn() });
    renderAt('/auth/mfa-verify');

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});

describe('a visitor with no sign-in waiting for a code', () => {
  it('on the two-factor code page goes to the sign-in page', () => {
    auth.mockReturnValue({ authenticated: false, mfaPending: false, verifyMFA: vi.fn(), verifyMFAWithBackupCode: vi.fn(), cancelMFA: vi.fn() });
    renderAt('/auth/mfa-verify');

    expect(screen.getByText('Login page')).toBeInTheDocument();
  });
});
