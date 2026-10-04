/**
 * The API client's answer to a 401, end to end through its interceptor.
 *
 * With unsaved changes held the page stays where it is and the signed-out
 * state is set; the requests themselves still fail, so whoever made them can
 * say so. The transport is stubbed: nothing leaves the test.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { api } from '@/services/api';
import { holdUnsavedWork, isSignedOut } from '@/services/unsavedWork';

const client = (api as unknown as { client: AxiosInstance }).client;
const originalAdapter = client.defaults.adapter;

function answerEveryRequestWith401() {
  client.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
      status: 401,
      statusText: 'Unauthorized',
      data: { error: 'Unauthorized', message: 'Authentication required' },
      headers: {},
      config,
    });
  };
}

afterEach(() => {
  client.defaults.adapter = originalAdapter;
  window.history.pushState({}, '', '/');
});

describe('a 401 while an editor holds unsaved changes', () => {
  it('leaves the page where it is and marks the browser signed out', async () => {
    window.history.pushState({}, '', '/characters/c1/edit');
    answerEveryRequestWith401();
    const release = holdUnsavedWork();

    await expect(api.pingSession()).rejects.toBeInstanceOf(AxiosError);

    expect(window.location.pathname).toBe('/characters/c1/edit');
    expect(isSignedOut()).toBe(true);
    release();
  });
});
