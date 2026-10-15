/**
 * When a sign-in page is refused for too many attempts, it shows the
 * server's sentence saying so.
 *
 * The sign-in, registration and password-reset limiters answered with a
 * plain-text body, so the pages found no message. The forgot-password page
 * then showed "Check your inbox" though nothing had been sent, and the reset
 * page blamed the link. The limiters now answer JSON, and each page shows the
 * message it carries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { AuthContextType } from '@/types/user.types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: { smtp: { configured: true } } }) }));
vi.mock('@/services/api', () => ({
  api: { getRegistrationStatus: vi.fn().mockResolvedValue({ allowRegistration: true }) },
}));
const forgotPassword = vi.fn();
const resetPassword = vi.fn();
vi.mock('@/services/auth.service', () => ({
  default: {
    forgotPassword: (...args: never[]) => forgotPassword(...args),
    resetPassword: (...args: never[]) => resetPassword(...args),
  },
  authService: {
    forgotPassword: (...args: never[]) => forgotPassword(...args),
    resetPassword: (...args: never[]) => resetPassword(...args),
  },
}));

import { useAuth } from '@/contexts/AuthContext';
import LoginPage from '../LoginPage';
import RegisterPage from '../RegisterPage';
import ForgotPasswordPage from '../ForgotPasswordPage';
import ResetPasswordPage from '../ResetPasswordPage';

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

/** The refusal as the API client throws it, with the limiter's JSON body. */
function rateLimited(message: string) {
  return Object.assign(new Error('Request failed with status code 429'), {
    response: { status: 429, data: { error: 'Rate Limited', message } },
  });
}

beforeEach(() => {
  mockUseAuth.mockReset();
  forgotPassword.mockReset();
  resetPassword.mockReset();
});

describe('the sign-in page', () => {
  it('shows the server\'s sentence, not its label', async () => {
    const login = vi.fn().mockRejectedValue(rateLimited('Too many authentication attempts, please try again later'));
    mockUseAuth.mockReturnValue(authState({ login }));
    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Too many authentication attempts, please try again later')).toBeInTheDocument();
    expect(screen.queryByText('Rate Limited')).not.toBeInTheDocument();
  });
});

describe('the registration page', () => {
  it('shows the server\'s sentence, not its label', async () => {
    const register = vi.fn().mockRejectedValue(rateLimited('Too many accounts created from this address, please try again later'));
    mockUseAuth.mockReturnValue(authState({ register }));
    render(<MemoryRouter><RegisterPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'AnotherGoodPass42!' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'AnotherGoodPass42!' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('Too many accounts created from this address, please try again later')).toBeInTheDocument();
    expect(screen.queryByText('Rate Limited')).not.toBeInTheDocument();
  });
});

describe('the forgot-password page', () => {
  it('shows the refusal instead of claiming an email was sent', async () => {
    forgotPassword.mockRejectedValue(rateLimited('Too many password reset requests, please try again later'));
    mockUseAuth.mockReturnValue(authState());
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'alice@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText('Too many password reset requests, please try again later')).toBeInTheDocument();
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument();
    // The form is still there to try again later.
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  // A failure with no answer from the server says nothing about the address,
  // so saying that nothing was sent tells nobody whether it has an account.
  it('says nothing was sent when the request fails without an answer', async () => {
    forgotPassword.mockRejectedValue(Object.assign(new Error('Network Error'), {}));
    mockUseAuth.mockReturnValue(authState());
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'alice@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('no email was sent'));
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument();
  });
});

describe('the reset-password page', () => {
  it('shows the refusal instead of blaming the link', async () => {
    resetPassword.mockRejectedValue(rateLimited('Too many authentication attempts, please try again later'));
    mockUseAuth.mockReturnValue(authState());
    render(
      <MemoryRouter initialEntries={['/reset-password?token=some-link']}>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'AnotherGoodPass42!' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'AnotherGoodPass42!' } });
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    expect(await screen.findByText('Too many authentication attempts, please try again later')).toBeInTheDocument();
    expect(screen.queryByText(/this link may have expired/i)).not.toBeInTheDocument();
  });
});
