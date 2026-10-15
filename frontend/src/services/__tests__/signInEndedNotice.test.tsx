/**
 * A sign-in that reached its 30-day limit says so on the sign-in page.
 *
 * Every sign-in ends 30 days after it was made, and the server answers the
 * next request with a 401 saying so. The API client sent the page to the
 * sign-in screen and dropped the sentence, so the person was left at the
 * sign-in page with no reason given. The sentence now goes with them, and
 * the sign-in page shows it once.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

const loadPage = vi.fn();
vi.mock('@/services/pageLoad', () => ({ loadPage: (url: string) => loadPage(url) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ authenticated: false, mfaPending: false, login: vi.fn() }) }));

import { api } from '@/services/api';
import LoginPage from '@/pages/auth/LoginPage';

const client = (api as unknown as { client: AxiosInstance }).client;
const originalAdapter = client.defaults.adapter;

function answer401(data: object) {
  client.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    if (config.url === '/api/auth/registration-status') {
      return { data: { allowRegistration: false }, status: 200, statusText: 'OK', headers: {}, config };
    }
    throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, { status: 401, statusText: 'Unauthorized', data, headers: {}, config });
  };
}

beforeEach(() => {
  loadPage.mockReset();
  sessionStorage.clear();
  window.history.pushState({}, '', '/dashboard');
});

afterEach(() => {
  client.defaults.adapter = originalAdapter;
  window.history.pushState({}, '', '/');
});

describe('a sign-in that has reached its limit', () => {
  it('goes to the sign-in page, which says why, once', async () => {
    answer401({ error: 'Unauthorized', code: 'SIGN_IN_EXPIRED', message: 'Your sign-in has reached its 30-day limit. Sign in again.' });

    await expect(api.listCampaigns()).rejects.toBeInstanceOf(AxiosError);
    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(String(loadPage.mock.calls[0][0])).toMatch(/^\/auth\/login/);

    const first = render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(await screen.findByText('Your sign-in has reached its 30-day limit. Sign in again.')).toBeInTheDocument();
    first.unmount();

    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(screen.queryByText('Your sign-in has reached its 30-day limit. Sign in again.')).not.toBeInTheDocument();
  });
});

describe('any other lost sign-in', () => {
  it('goes to the sign-in page with nothing more to say', async () => {
    answer401({ error: 'Unauthorized', message: 'You must be logged in to access this resource' });

    await expect(api.listCampaigns()).rejects.toBeInstanceOf(AxiosError);
    expect(loadPage).toHaveBeenCalledTimes(1);

    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    expect(screen.queryByText('You must be logged in to access this resource')).not.toBeInTheDocument();
  });
});
