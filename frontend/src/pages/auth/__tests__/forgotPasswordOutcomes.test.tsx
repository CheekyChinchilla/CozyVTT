/**
 * The forgot-password page says what really happened.
 *
 * It said "Check your inbox ... we've sent a password reset link" whatever
 * the outcome: on a server error, with no connection, and on an instance
 * that cannot send email, where the server's own answer is "Password reset
 * is not available. Contact your administrator." Now the success card shows
 * the server's answer, an instance without email says so before anyone
 * types an address, and a failure stays on the form with an error.
 *
 * None of this depends on whether the address has an account, so the page
 * still tells nobody which addresses do.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ServerConfig } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ authenticated: false }) }));
const forgotPassword = vi.fn();
vi.mock('@/services/auth.service', () => ({
  default: { forgotPassword: (...args: never[]) => forgotPassword(...args) },
  authService: { forgotPassword: (...args: never[]) => forgotPassword(...args) },
}));
let serverConfig: Partial<ServerConfig> | undefined;
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: serverConfig }) }));

import ForgotPasswordPage from '../ForgotPasswordPage';

const httpError = (status: number, data: object = {}) =>
  Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } });

function submit() {
  render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'alice@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
}

beforeEach(() => {
  forgotPassword.mockReset();
  serverConfig = { smtp: { configured: true } };
});

describe('the forgot-password page', () => {
  it("shows the server's answer once the request is taken", async () => {
    forgotPassword.mockResolvedValue('If an account with that email exists, a password reset link has been sent.');
    submit();

    expect(await screen.findByText('If an account with that email exists, a password reset link has been sent.')).toBeInTheDocument();
    expect(screen.getByText('Check your inbox')).toBeInTheDocument();
  });

  it('on a server error stays on the form and says nothing was sent', async () => {
    forgotPassword.mockRejectedValue(httpError(500, { error: 'Internal Server Error', message: 'An unexpected error occurred' }));
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Your request could not be completed, so no email was sent. Please try again in a few minutes.');
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('with no connection stays on the form and says nothing was sent', async () => {
    forgotPassword.mockRejectedValue(Object.assign(new Error('Network Error'), { request: {} }));
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be completed');
    expect(screen.queryByText('Check your inbox')).not.toBeInTheDocument();
  });

  it('on an instance that cannot send email says so, and offers no form', () => {
    serverConfig = { smtp: { configured: false } };
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);

    expect(screen.getByText('Password reset by email is not available')).toBeInTheDocument();
    expect(screen.getByText(/ask your platform administrator/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  });

  it("does not claim a link was sent when the server's answer says reset is not available", async () => {
    // The page's settings may not have loaded yet; the answer decides.
    serverConfig = undefined;
    forgotPassword.mockResolvedValue('Password reset is not available. Contact your administrator.');
    submit();

    expect(await screen.findByText('Password reset is not available. Contact your administrator.')).toBeInTheDocument();
    expect(screen.queryByText(/we've sent a password reset link/)).not.toBeInTheDocument();
  });
});
