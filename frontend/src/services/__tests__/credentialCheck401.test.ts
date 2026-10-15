/**
 * A wrong password or code given while signed in is the form's to show.
 *
 * Changing the password, deleting the account, turning MFA off, making new
 * backup codes and changing the email address each ask for the current
 * password (and MFA off for a code too), and the server answers a wrong one
 * with 401. The API client took every 401 on a signed-in page for a lost
 * sign-in and sent the page to sign in, so the form never said what was
 * wrong and whatever else was on the page went with it. Those calls now
 * leave the 401 to the form; every other request still goes to sign in.
 *
 * The transport is stubbed: nothing leaves the test.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

const handleUnauthorized = vi.fn();
vi.mock('@/services/unsavedWork', () => ({
  handleUnauthorized: (...args: unknown[]) => handleUnauthorized(...args),
}));

import { api } from '@/services/api';

const client = (api as unknown as { client: AxiosInstance }).client;
const originalAdapter = client.defaults.adapter;

function answerEveryRequestWith401(message: string) {
  client.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
      status: 401,
      statusText: 'Unauthorized',
      data: { error: 'Authentication Failed', message },
      headers: {},
      config,
    });
  };
}

beforeEach(() => {
  handleUnauthorized.mockReset();
  window.history.pushState({}, '', '/profile');
});

afterEach(() => {
  client.defaults.adapter = originalAdapter;
  window.history.pushState({}, '', '/');
});

describe('a 401 from a call that checks the password or a code', () => {
  it.each([
    ['change password', () => api.changePassword({ currentPassword: 'wrong', newPassword: 'Another1!Password' })],
    ['delete account', () => api.deleteAccount('wrong')],
    ['turn MFA off', () => api.mfaDisable('wrong', '000000')],
    ['new backup codes', () => api.mfaRegenerateBackupCodes('wrong')],
    ['change email', () => api.updateUser('u-1', { email: 'new@example.test', currentPassword: 'wrong' })],
  ])('%s: stays on the page and lets the caller show the message', async (_name, call) => {
    answerEveryRequestWith401('Current password is incorrect');

    const failure = await call().catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(AxiosError);
    expect(handleUnauthorized).not.toHaveBeenCalled();
  });
});

describe('a 401 from any other call', () => {
  it('still goes to sign in', async () => {
    answerEveryRequestWith401('You must be logged in to access this resource');

    await expect(api.pingSession()).rejects.toBeInstanceOf(AxiosError);

    expect(handleUnauthorized).toHaveBeenCalledTimes(1);
    expect(handleUnauthorized.mock.calls[0][0]).toBe('/profile');
  });

  it('still goes to sign in for a profile edit that asks for no password', async () => {
    answerEveryRequestWith401('You must be logged in to access this resource');

    await expect(api.updateUser('u-1', { displayName: 'Sam' })).rejects.toBeInstanceOf(AxiosError);

    expect(handleUnauthorized).toHaveBeenCalledTimes(1);
  });
});
