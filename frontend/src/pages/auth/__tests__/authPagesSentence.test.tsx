/**
 * The sign-in, sign-up and two-factor pages show the server's sentence.
 *
 * A refusal carries a short label (`error`, such as "Authentication Failed",
 * "Registration Failed" or "Invalid Code") and a sentence meant for the
 * person (`message`). The pages showed the label, so sign-up said
 * "Registration Failed" for an address already registered, and the code step
 * said "Sign-In Expired" where the server explains what to do.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AuthContextType } from '@/types/user.types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/services/api', () => ({
  api: { getRegistrationStatus: vi.fn().mockResolvedValue({ allowRegistration: true }) },
}));

import { useAuth } from '@/contexts/AuthContext';
import LoginPage from '../LoginPage';
import RegisterPage from '../RegisterPage';
import MFAVerifyPage from '../MFAVerifyPage';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

function authState(overrides: Partial<AuthContextType> = {}): AuthContextType {
  return {
    user: null,
    loading: false,
    authenticated: false,
    mfaPending: false,
    mustChangePassword: false,
    serverUnreachable: false,
    backupCodesLeft: null,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    verifyMFA: vi.fn(),
    verifyMFAWithBackupCode: vi.fn(),
    cancelMFA: vi.fn(),
    setupMFA: vi.fn(),
    completeMFASetup: vi.fn(),
    disableMFA: vi.fn(),
    changePassword: vi.fn(),
    refreshUser: vi.fn(),
    adoptSession: vi.fn(),
    retryAuthCheck: vi.fn(),
    dismissBackupCodesLeft: vi.fn(),
    ...overrides,
  };
}

/** A refusal as the API client throws it. */
const refusal = (status: number, error: string, message: string) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { error, message } } });

beforeEach(() => {
  mockUseAuth.mockReset();
});

describe('the sign-in page', () => {
  it('shows "Invalid email or password", not the label', async () => {
    const login = vi.fn().mockRejectedValue(refusal(401, 'Authentication Failed', 'Invalid email or password'));
    mockUseAuth.mockReturnValue(authState({ login }));
    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(screen.queryByText('Authentication Failed')).not.toBeInTheDocument();
  });
});

describe('the sign-up page', () => {
  it('shows why the account was not made', async () => {
    const register = vi.fn().mockRejectedValue(refusal(400, 'Registration Failed', 'Email already registered'));
    mockUseAuth.mockReturnValue(authState({ register }));
    render(<MemoryRouter><RegisterPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'AnotherGoodPass42!' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'AnotherGoodPass42!' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Email already registered')).toBeInTheDocument();
    expect(screen.queryByText('Registration Failed')).not.toBeInTheDocument();
  });
});

describe('the two-factor code page', () => {
  it.each([
    ['a wrong code', refusal(401, 'Invalid Code', 'Invalid authentication code. Please try again.'), 'Invalid authentication code. Please try again.', 'Invalid Code'],
    ['a code step that timed out', refusal(401, 'Sign-In Expired', 'Your sign-in timed out at the code step. Sign in again with your password.'), 'Your sign-in timed out at the code step. Sign in again with your password.', 'Sign-In Expired'],
    ['too many wrong codes', refusal(429, 'Rate Limited', 'Too many MFA login attempts, please try again later'), 'Too many MFA login attempts, please try again later', 'Rate Limited'],
  ])('shows the sentence for %s', async (_name, failure, sentence, label) => {
    const verifyMFA = vi.fn().mockRejectedValue(failure);
    mockUseAuth.mockReturnValue(authState({ mfaPending: true, verifyMFA }));
    render(<MemoryRouter><MFAVerifyPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Authentication Code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify Code' }));

    expect(await screen.findByText(sentence)).toBeInTheDocument();
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  });

  it('shows the sentence for a wrong backup code', async () => {
    const verifyMFAWithBackupCode = vi.fn().mockRejectedValue(refusal(401, 'Invalid Code', 'Invalid backup code. Please try again.'));
    mockUseAuth.mockReturnValue(authState({ mfaPending: true, verifyMFAWithBackupCode }));
    render(<MemoryRouter><MFAVerifyPage /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: /use a backup code/i }));
    fireEvent.change(screen.getByLabelText('Backup Code'), { target: { value: 'ABCD2345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify Backup Code' }));

    expect(await screen.findByText('Invalid backup code. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText('Invalid Code')).not.toBeInTheDocument();
  });
});
