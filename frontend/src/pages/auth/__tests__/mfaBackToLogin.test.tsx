/**
 * "Back to login" on the two-factor code page goes back to the sign-in page.
 *
 * The sign-in waiting for its code stayed set, so the sign-in page sent the
 * user straight back to the code page: there was no way back to try another
 * account or password short of reloading. The button now ends the waiting
 * sign-in, here and on the server, first.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '@/contexts/AuthContext';

const getCurrentUser = vi.fn();
const login = vi.fn();
const logout = vi.fn();
vi.mock('@/services/auth.service', () => ({
  authService: {
    getCurrentUser: (...args: never[]) => getCurrentUser(...args),
    login: (...args: never[]) => login(...args),
    logout: (...args: never[]) => logout(...args),
    register: vi.fn(),
  },
}));
vi.mock('@/services/api', () => ({
  api: { getRegistrationStatus: vi.fn().mockResolvedValue({ allowRegistration: false }) },
}));

import LoginPage from '../LoginPage';
import MFAVerifyPage from '../MFAVerifyPage';

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockRejectedValue(Object.assign(new Error('Unauthorized'), { response: { status: 401, data: {} } }));
  login.mockResolvedValue({ mfaRequired: true, message: 'MFA verification required. Please enter your TOTP code.' });
  logout.mockResolvedValue(undefined);
});

it('ends the waiting sign-in and stays on the sign-in page', async () => {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/auth/login']}>
        <Routes>
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/mfa-verify" element={<MFAVerifyPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );

  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'alice@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Another1!Password' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
  expect(await screen.findByRole('heading', { name: 'Two-Factor Authentication' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Back to login' }));

  expect(await screen.findByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Two-Factor Authentication' })).not.toBeInTheDocument();
  // The server's half of the waiting sign-in is ended too.
  expect(logout).toHaveBeenCalledTimes(1);
});
