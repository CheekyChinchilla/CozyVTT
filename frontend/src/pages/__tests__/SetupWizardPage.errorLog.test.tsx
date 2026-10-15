/**
 * A failed setup is logged without the administrator's password.
 *
 * The wizard logged the whole error the API client throws, which carries
 * the request it answered: the new administrator's email and password. Error
 * lines are kept in production builds, so the password sat in the browser
 * console. Only the status and the server's message are logged now.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import SetupWizardPage from '../SetupWizardPage';

vi.mock('framer-motion', () => {
  const MotionDiv = (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  };
  return {
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ mascotUrl: '/mascot.png' }) }));

const adoptSession = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ adoptSession }) }));

const navigate = vi.fn();
vi.mock('react-router', async () => ({
  ...(await vi.importActual<typeof import('react-router')>('react-router')),
  useNavigate: () => navigate,
}));

const setupService = vi.hoisted(() => ({
  checkSetupStatus: vi.fn(),
  initializeSetup: vi.fn(),
}));
vi.mock('@/services/setup.service', () => ({ setupService, default: setupService }));

const PASSWORD = 'FirstAdmin1!Cozy';
const TOKEN = '3f9c2a7d1b8e4c6f0a5d9e2b7c1f4a8d';

async function openAccountStep() {
  render(
    <MemoryRouter>
      <SetupWizardPage />
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByRole('button', { name: /next/i }));
  await screen.findByText('Create Admin Account');
}

function fillAccount(withToken: boolean) {
  fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'First Admin' } });
  fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'admin@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } });
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: PASSWORD } });
  if (withToken) fireEvent.change(screen.getByLabelText('Setup token'), { target: { value: TOKEN } });
}

async function reachReview() {
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
  await screen.findByText('System Configuration');
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
  await screen.findByText('Review & Confirm');
}

describe('a setup the server refuses', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    setupService.checkSetupStatus.mockReset().mockResolvedValue({ setupCompleted: false, hasUsers: false, needsSetup: true });
    setupService.initializeSetup.mockReset();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleError.mockRestore();
  });

  it('is logged without the password it was sent with', async () => {
    const config = {
      headers: new AxiosHeaders(),
      url: '/api/setup/init',
      method: 'post',
      data: JSON.stringify({ email: 'admin@example.com', password: PASSWORD, setupToken: TOKEN }),
    } as InternalAxiosRequestConfig;
    setupService.initializeSetup.mockRejectedValue(new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST', config, {}, {
      status: 400,
      statusText: 'Bad Request',
      data: { error: 'Setup Already Completed', message: 'System setup has already been completed' },
      headers: {},
      config,
    }));
    await openAccountStep();
    fillAccount(true);
    await reachReview();

    fireEvent.click(screen.getByRole('button', { name: /complete setup/i }));
    await screen.findByText('System setup has already been completed');

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    const written = consoleError.mock.calls
      .flat()
      .map((arg: unknown) => (typeof arg === 'string' ? arg : JSON.stringify(arg && typeof arg === 'object' && 'config' in arg ? (arg as { config: unknown }).config : arg)))
      .join(' ');
    expect(written).not.toContain(PASSWORD);
    expect(written).not.toContain(TOKEN);
  });
});
