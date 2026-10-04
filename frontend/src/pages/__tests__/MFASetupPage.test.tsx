/**
 * Setting up MFA starts with the current password.
 *
 * The server refuses to begin enrolment without it, so the page asks first and
 * does not request a secret on load. A wrong password is shown on the page,
 * in the server's words, and the person can try again.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MFASetupPage from '../MFASetupPage';
import type { AuthContextType } from '@/types/user.types';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '@/contexts/AuthContext';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

function authState(overrides: Partial<AuthContextType> = {}): AuthContextType {
  return {
    user: null,
    loading: false,
    authenticated: true,
    mfaPending: false,
    mustChangePassword: false,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    verifyMFA: vi.fn(),
    verifyMFAWithBackupCode: vi.fn(),
    setupMFA: vi.fn(),
    completeMFASetup: vi.fn(),
    disableMFA: vi.fn(),
    changePassword: vi.fn(),
    refreshUser: vi.fn(),
    adoptSession: vi.fn(),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MFASetupPage />
    </MemoryRouter>
  );
}

/** An axios-shaped rejection, as the API client throws it. */
function apiError(status: number, message: string) {
  return Object.assign(new Error(message), { response: { status, data: { message } } });
}

describe('MFASetupPage', () => {
  beforeEach(() => mockUseAuth.mockReset());

  it('asks for the current password and does not start enrolment on load', () => {
    const setupMFA = vi.fn();
    mockUseAuth.mockReturnValue(authState({ setupMFA }));
    renderPage();

    expect(screen.getByLabelText('Current password')).toBeInTheDocument();
    expect(setupMFA).not.toHaveBeenCalled();
  });

  it('starts enrolment with the password and shows the QR code', async () => {
    const setupMFA = vi.fn().mockResolvedValue({ message: 'ok', qrCodeUrl: 'data:image/png;base64,AA', secret: 'SECRETKEY' });
    mockUseAuth.mockReturnValue(authState({ setupMFA }));
    renderPage();

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'MyPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(screen.getByAltText('MFA QR Code')).toBeInTheDocument());
    expect(setupMFA).toHaveBeenCalledWith('MyPassword123!');
    expect(screen.getByText('SECRETKEY')).toBeInTheDocument();
  });

  // The server sends each backup code already split, as ABCD-EFGH. The page
  // split it again, so it showed ABCD--EFGH, which the sign-in box refused.
  it('shows each backup code as the server sends it', async () => {
    const setupMFA = vi.fn().mockResolvedValue({ message: 'ok', qrCodeUrl: 'data:image/png;base64,AA', secret: 'SECRETKEY' });
    const completeMFASetup = vi.fn().mockResolvedValue({ message: 'ok', backupCodes: ['ABCD-EFGH', 'JKLM-NPQR'] });
    mockUseAuth.mockReturnValue(authState({ setupMFA, completeMFASetup }));
    renderPage();

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'MyPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(screen.getByAltText('MFA QR Code')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify & enable/i }));

    expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument();
    expect(screen.getByText('JKLM-NPQR')).toBeInTheDocument();
    expect(screen.queryByText(/--/)).not.toBeInTheDocument();
  });

  it('shows the server\'s reason when the password is wrong, and lets them try again', async () => {
    const setupMFA = vi.fn().mockRejectedValueOnce(apiError(401, 'Incorrect password'));
    mockUseAuth.mockReturnValue(authState({ setupMFA }));
    renderPage();

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(screen.getByText('Incorrect password')).toBeInTheDocument());
    expect(screen.getByLabelText('Current password')).toBeInTheDocument();
    expect(screen.queryByAltText('MFA QR Code')).not.toBeInTheDocument();
  });
});
