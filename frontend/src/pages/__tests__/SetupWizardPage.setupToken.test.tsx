/**
 * The setup wizard asks for the setup token.
 *
 * Until setup has run, whoever submits the wizard becomes the administrator,
 * so the server asks for a token only the owner can read: the one printed in
 * the backend log at start, or SETUP_TOKEN. The wizard asks for it with the
 * account details, will not go on without it, sends it with the submission,
 * and shows the server's answer when it is wrong.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    useReducedMotionConfig: () => false,
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

/** An axios-shaped rejection, as the API client throws it. */
function apiError(status: number, error: string, message: string) {
  return Object.assign(new Error(message), { response: { status, data: { error, message } } });
}

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

describe('SetupWizardPage', () => {
  beforeEach(() => {
    setupService.checkSetupStatus.mockReset().mockResolvedValue({ setupCompleted: false, hasUsers: false, needsSetup: true });
    setupService.initializeSetup.mockReset();
    adoptSession.mockReset();
    navigate.mockReset();
  });

  it('asks for the setup token with the account details and will not go on without it', async () => {
    await openAccountStep();
    fillAccount(false);

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    expect(await screen.findByText('Setup token is required')).toBeInTheDocument();
    expect(screen.getByText('Create Admin Account')).toBeInTheDocument();
  });

  it('sends the token with the administrator\'s details', async () => {
    setupService.initializeSetup.mockResolvedValue({ message: 'Setup completed successfully', user: { id: 'u1', platformRole: 'ADMIN' } });
    await openAccountStep();
    fillAccount(true);
    await reachReview();

    fireEvent.click(screen.getByRole('button', { name: /complete setup/i }));

    await waitFor(() => expect(setupService.initializeSetup).toHaveBeenCalledTimes(1));
    expect(setupService.initializeSetup).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin@example.com', password: PASSWORD, displayName: 'First Admin', setupToken: TOKEN })
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard'));
  });

  // Nothing used the timezone the wizard asked for, so it no longer asks.
  it('asks for the instance name and no timezone, and sends none', async () => {
    setupService.initializeSetup.mockResolvedValue({ message: 'Setup completed successfully', user: { id: 'u1', platformRole: 'ADMIN' } });
    await openAccountStep();
    fillAccount(true);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await screen.findByText('System Configuration');

    expect(screen.getByLabelText(/Instance Name/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Timezone/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await screen.findByText('Review & Confirm');
    expect(screen.queryByText(/Timezone/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /complete setup/i }));
    await waitFor(() => expect(setupService.initializeSetup).toHaveBeenCalledTimes(1));
    expect(setupService.initializeSetup.mock.calls[0][0]).not.toHaveProperty('timezone');
  });

  it('shows the server\'s answer when the token is wrong, and keeps the form', async () => {
    const message = 'Setup token is missing or wrong. Copy it from the backend log (docker compose logs backend), or from SETUP_TOKEN in .env if you set one.';
    setupService.initializeSetup.mockRejectedValue(apiError(403, 'Forbidden', message));
    await openAccountStep();
    fillAccount(true);
    await reachReview();

    fireEvent.click(screen.getByRole('button', { name: /complete setup/i }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(adoptSession).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /complete setup/i })).toBeInTheDocument();
  });
});
