/**
 * Changing your email address from the Profile page.
 *
 * The server already took a new address with the current password; the page
 * said "Email cannot be changed." The form sends both, shows the server's
 * refusals as they come (a wrong password, an address in use, too many
 * attempts) without leaving the page, and shows the new address once it has
 * changed. What it says about a notice to the old address follows whether
 * the server sends email. Requests go through the real API client and
 * service, with only the transport stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { useSyncExternalStore } from 'react';
import { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

const handleUnauthorized = vi.fn();
vi.mock('@/services/unsavedWork', () => ({
  handleUnauthorized: (...args: unknown[]) => handleUnauthorized(...args),
}));

import { api } from '@/services/api';
import ProfilePage from '../ProfilePage';

interface Account {
  id: string;
  email: string;
  displayName: string;
  platformRole: 'USER';
  mfaEnabled: boolean;
  avatarUrl: null;
}

const OLD = 'sam@example.test';
const NEW = 'sam.new@example.test';

// The signed-in account, as AuthContext holds it: refreshUser reads it again.
let account: Account;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const refreshUser = vi.fn(async () => {
  account = { ...account, email: stored };
  listeners.forEach((listener) => listener());
});
let stored = OLD;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: useSyncExternalStore(subscribe, () => account),
    logout: vi.fn(),
    refreshUser: () => refreshUser(),
    changePassword: vi.fn(),
  }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ appearance: null, applyUserPreferences: vi.fn() }),
}));
let smtp: { configured: boolean } | undefined;
vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: smtp === undefined ? undefined : { smtp } }),
}));
vi.mock('@/components/profile/MFASection', () => ({ default: () => null }));

const client = (api as unknown as { client: AxiosInstance }).client;
const originalAdapter = client.defaults.adapter;

/** The bodies sent to PUT /api/users/u-1. */
let sent: unknown[];

function refuse(config: InternalAxiosRequestConfig, status: number, data: object, headers: Record<string, string> = {}): never {
  throw new AxiosError('Refused', 'ERR_BAD_REQUEST', config, null, {
    status,
    statusText: 'Refused',
    data,
    headers,
    config,
  });
}

/** Stub the transport; `answer` decides what PUT /api/users/u-1 gets. */
function serve(answer: (config: InternalAxiosRequestConfig, body: { email?: string }) => unknown) {
  client.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    if (config.url === '/api/users/u-1' && config.method === 'put') {
      const body: unknown = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      sent.push(body);
      const data = answer(config, body as { email?: string });
      return { data, status: 200, statusText: 'OK', headers: {}, config };
    }
    return { data: { preferences: {} }, status: 200, statusText: 'OK', headers: {}, config };
  };
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/profile']}>
      <ProfilePage />
    </MemoryRouter>
  );
}

function emailForm(): HTMLFormElement {
  const form = screen.getByLabelText('New Email Address').closest('form');
  if (!form) throw new Error('The Change Email form is not open');
  return form;
}

async function fillAndSubmit(address: string, password: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Change Email' }));
  const form = emailForm();
  await userEvent.type(within(form).getByLabelText('New Email Address'), address);
  await userEvent.type(within(form).getByLabelText('Current Password'), password);
  await userEvent.click(within(form).getByRole('button', { name: 'Change Email' }));
}

beforeEach(() => {
  account = { id: 'u-1', email: OLD, displayName: 'Sam', platformRole: 'USER', mfaEnabled: false, avatarUrl: null };
  stored = OLD;
  sent = [];
  smtp = { configured: true };
  handleUnauthorized.mockClear();
  refreshUser.mockClear();
  window.history.pushState({}, '', '/profile');
});

afterEach(() => {
  client.defaults.adapter = originalAdapter;
  window.history.pushState({}, '', '/');
});

describe('Change Email on the Profile page', () => {
  it('no longer says the address cannot be changed', () => {
    serve(() => ({}));
    renderPage();
    expect(screen.queryByText('Email cannot be changed.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change Email' })).toBeInTheDocument();
  });

  it('sends the new address with the current password and shows it once changed', async () => {
    serve((_config, body) => {
      stored = body.email ?? stored;
      return { message: 'User updated successfully', user: { ...account, email: stored } };
    });
    renderPage();
    // One status region, on the page before anything is said, so a screen
    // reader announces the text set in it when the form closes.
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');
    await fillAndSubmit(NEW, 'My-current-password1!');

    expect(sent).toEqual([{ email: NEW, currentPassword: 'My-current-password1!' }]);
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(`Email changed to ${NEW}.`)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBe(status);
    expect(status).toHaveTextContent(`Email changed to ${NEW}.`);
    expect(screen.getByText(NEW)).toBeInTheDocument();
    expect(screen.queryByText(OLD)).not.toBeInTheDocument();
    // The form has closed and its password is gone.
    expect(screen.queryByLabelText('New Email Address')).not.toBeInTheDocument();
  });

  it.each([
    ['a wrong password', 401, { error: 'Authentication Failed', message: 'Current password is incorrect' }],
    ['an address in use', 400, { error: 'Bad Request', message: 'Email already in use' }],
    ['too many attempts', 429, {
      error: 'Rate Limited',
      message: 'You have tried to change your email address 5 times in the last hour, the most this server allows. Please try again later.',
    }],
  ])('shows the server\'s refusal for %s and keeps the form', async (_case, status, data) => {
    serve((config) => refuse(config, status, data, status === 429 ? { 'retry-after': '3600' } : {}));
    renderPage();
    await fillAndSubmit(NEW, 'Mistyped-password1!');

    expect(await screen.findByRole('alert')).toHaveTextContent(data.message);
    expect(handleUnauthorized).not.toHaveBeenCalled();
    expect(refreshUser).not.toHaveBeenCalled();
    expect(screen.getByLabelText('New Email Address')).toHaveValue(NEW);
    expect(screen.getByLabelText('New Email Address')).toHaveFocus();
    expect(screen.getByText(OLD)).toBeInTheDocument();
  });

  it('refuses its own address and a malformed one without asking the server', async () => {
    serve(() => ({}));
    renderPage();
    await fillAndSubmit(OLD.toUpperCase(), 'My-current-password1!');
    expect(await screen.findByRole('alert')).toHaveTextContent('That is already your email address');
    expect(screen.getByLabelText('New Email Address')).toHaveFocus();

    const form = emailForm();
    const input = within(form).getByLabelText('New Email Address');
    await userEvent.clear(input);
    await userEvent.type(input, 'not-an-address');
    await userEvent.click(within(form).getByRole('button', { name: 'Change Email' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
    expect(sent).toEqual([]);
  });

  it('says a notice goes to the old address when the server sends email', async () => {
    serve(() => ({}));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Change Email' }));
    expect(screen.getByText(`A notice that the address changed goes to ${OLD}.`)).toBeInTheDocument();
    expect(screen.getByLabelText('New Email Address')).toHaveAccessibleDescription(`A notice that the address changed goes to ${OLD}.`);
  });

  it('promises no notice when the server does not send email', async () => {
    smtp = { configured: false };
    serve(() => ({}));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Change Email' }));
    expect(screen.getByText('This server does not send email, so no notice goes to your current address.')).toBeInTheDocument();
    expect(screen.queryByText(/goes to sam@example\.test/)).not.toBeInTheDocument();
  });

  it('words the notice so it is true either way while that is not known', async () => {
    smtp = undefined;
    serve(() => ({}));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Change Email' }));
    expect(screen.getByText('If this server sends email, a notice that the address changed goes to your current address.')).toBeInTheDocument();
  });

  it('closes on Cancel without sending anything, and gives the focus back', async () => {
    serve(() => ({}));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Change Email' }));
    const form = emailForm();
    await userEvent.type(within(form).getByLabelText('New Email Address'), NEW);
    await userEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('New Email Address')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change Email' })).toHaveFocus();
    expect(sent).toEqual([]);
  });
});
