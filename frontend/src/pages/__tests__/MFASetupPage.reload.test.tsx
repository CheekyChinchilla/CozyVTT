/**
 * Reloading the two-factor setup page keeps you on it, and leaving the
 * backup codes unsaved asks first.
 *
 * The page sent anyone it did not yet know to be signed in to the sign-in
 * page, without waiting for the check that runs as a page loads, so a reload
 * during setup could end on the dashboard. The backup codes exist only on
 * that page once two-factor authentication is on, so a reload or a closed
 * tab before saving them lost them without a word. The page now waits for
 * the check, and asks before the page is left while the codes are unsaved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const auth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth() }));

import MFASetupPage from '../MFASetupPage';

const setupMFA = vi.fn().mockResolvedValue({ message: 'ok', qrCodeUrl: 'data:image/png;base64,AA', secret: 'SECRETKEY' });
const completeMFASetup = vi.fn().mockResolvedValue({ message: 'ok', backupCodes: ['ABCD-EFGH', 'JKLM-NPQR'] });

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/auth/mfa-setup']}>
      <Routes>
        <Route path="/auth/mfa-setup" element={<MFASetupPage />} />
        <Route path="/auth/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

/** Whether leaving the page now would be stopped to ask. */
function leavingIsQuestioned(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  auth.mockReset();
});

describe('opening the setup page', () => {
  it('waits for the sign-in check before deciding where to go', () => {
    auth.mockReturnValue({ authenticated: false, loading: true, setupMFA, completeMFASetup });
    renderPage();

    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('goes to the sign-in page once the check says nobody is signed in', () => {
    auth.mockReturnValue({ authenticated: false, loading: false, setupMFA, completeMFASetup });
    renderPage();

    expect(screen.getByText('Login page')).toBeInTheDocument();
  });
});

describe('leaving with the backup codes on screen', () => {
  it('asks first until the codes are marked saved', async () => {
    auth.mockReturnValue({ authenticated: true, loading: false, setupMFA, completeMFASetup });
    renderPage();
    expect(leavingIsQuestioned()).toBe(false);

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'MyPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(screen.getByAltText('MFA QR Code')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify & enable/i }));
    await screen.findByText('ABCD-EFGH');

    // The listener is added by an effect that can run after the codes show.
    await waitFor(() => expect(leavingIsQuestioned()).toBe(true));

    fireEvent.click(screen.getByRole('checkbox'));
    expect(leavingIsQuestioned()).toBe(false);
  });
});

// The setup page is outside the routes that wait for the server, so while the
// sign-in check got no answer it showed a spinner for as long as that lasted.
describe('while the server does not answer', () => {
  it('says so and offers to try again, as the other pages do', () => {
    const retryAuthCheck = vi.fn();
    auth.mockReturnValue({ authenticated: false, loading: true, serverUnreachable: true, retryAuthCheck, setupMFA, completeMFASetup });
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach the server");
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(retryAuthCheck).toHaveBeenCalled();
  });
});
