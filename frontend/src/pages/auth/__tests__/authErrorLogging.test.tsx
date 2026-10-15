/**
 * A failed sign-in step is logged without the request that carried it.
 *
 * The pages logged the whole error the API client throws, and that error
 * carries the request it answered, body included. So a failed two-factor
 * code left the code in the browser console, and a failed setup left the new
 * administrator's password there (error lines are kept in production
 * builds), for anyone with the console or a screenshot of it. They now log
 * only the status and the server's message.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { errorSummary } from '@/utils/errors';

const verifyMFA = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ mfaPending: true, authenticated: false, verifyMFA, verifyMFAWithBackupCode: verifyMFA, cancelMFA: vi.fn() }),
}));

import MFAVerifyPage from '../MFAVerifyPage';

/** A refusal exactly as axios builds it, holding the request it answered. */
function refusalOf(body: object): AxiosError {
  const config = { headers: new AxiosHeaders(), url: '/api/auth/mfa/verify-login', method: 'post', data: JSON.stringify(body) } as InternalAxiosRequestConfig;
  return new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config, {}, {
    status: 401,
    statusText: 'Unauthorized',
    data: { error: 'Invalid Code', message: 'Invalid authentication code. Please try again.' },
    headers: {},
    config,
  });
}

/** Everything written to the console as one string, objects included. */
function logged(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls
    .flat()
    .map((arg: unknown) => {
      if (typeof arg === 'string') return arg;
      if (arg && typeof arg === 'object' && 'config' in arg) return JSON.stringify((arg as { config: unknown }).config);
      return JSON.stringify(arg);
    })
    .join(' ');
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  verifyMFA.mockReset();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

describe('a wrong two-factor code', () => {
  it('is logged with its status and message, and not the code', async () => {
    verifyMFA.mockRejectedValue(refusalOf({ token: '424242' }));
    render(<MemoryRouter><MFAVerifyPage /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Authentication Code'), { target: { value: '424242' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify Code' }));
    await screen.findByText('Invalid authentication code. Please try again.');

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(logged(consoleError)).not.toContain('424242');
    expect(logged(consoleError)).toContain('401');
  });
});

describe('errorSummary', () => {
  it('names the status and message, and leaves the request out', () => {
    const summary = errorSummary(refusalOf({ password: 'Secret1!Password' }));

    expect(summary).toBe('401 Invalid authentication code. Please try again.');
    expect(summary).not.toContain('Secret1!Password');
  });

  it('falls back to the error\'s own message', () => {
    expect(errorSummary(new Error('Network Error'))).toBe('Network Error');
    expect(errorSummary('something odd')).toBe('Unknown error');
  });
});
