/**
 * The Copy buttons for the two-factor secret and the backup codes work on
 * plain HTTP, and say so when copying fails.
 *
 * The browser offers its clipboard to a page only over HTTPS (or on
 * localhost), and CozyVTT also runs over plain HTTP on a home network. There
 * the buttons threw and did nothing visible, so someone could tick "I have
 * saved my codes" believing they were copied. Where the browser refused the
 * copy, the button said "Copied!" anyway. They now fall back to the older
 * way of copying, and say so when nothing could be copied.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
const mfaRegenerateBackupCodes = vi.fn();
vi.mock('@/services/api', () => ({ api: { mfaRegenerateBackupCodes: (...args: never[]) => mfaRegenerateBackupCodes(...args) } }));

import { useAuth } from '@/contexts/AuthContext';
import MFASetupPage from '../MFASetupPage';
import MFASection from '@/components/profile/MFASection';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const setupMFA = vi.fn().mockResolvedValue({ message: 'ok', qrCodeUrl: 'data:image/png;base64,AA', secret: 'SECRETKEY' });
const completeMFASetup = vi.fn().mockResolvedValue({ message: 'ok', backupCodes: ['ABCD-EFGH', 'JKLM-NPQR'] });

const execCommand = vi.fn();

function setClipboard(clipboard: { writeText: (text: string) => Promise<void> } | undefined) {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
}

async function reachBackupCodes() {
  render(<MemoryRouter><MFASetupPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'MyPassword123!' } });
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
  await waitFor(() => expect(screen.getByAltText('MFA QR Code')).toBeInTheDocument());
  fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: /verify & enable/i }));
  await screen.findByText('ABCD-EFGH');
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ authenticated: true, loading: false, setupMFA, completeMFASetup });
  execCommand.mockReset();
  Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
});

afterEach(() => {
  setClipboard(undefined);
});

describe('Copy all on the backup codes', () => {
  it('copies over plain HTTP, where the browser offers no clipboard', async () => {
    setClipboard(undefined);
    execCommand.mockReturnValue(true);
    await reachBackupCodes();

    fireEvent.click(screen.getByRole('button', { name: /copy all/i }));

    expect(await screen.findByText('Copied!')).toBeInTheDocument();
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('says so when nothing could be copied', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('Write permission denied')) });
    execCommand.mockReturnValue(false);
    await reachBackupCodes();

    fireEvent.click(screen.getByRole('button', { name: /copy all/i }));

    expect(await screen.findByText('Copy failed. Select the codes and copy them by hand.')).toBeInTheDocument();
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument();
  });

  it('uses the clipboard where the browser offers it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    await reachBackupCodes();

    fireEvent.click(screen.getByRole('button', { name: /copy all/i }));

    expect(await screen.findByText('Copied!')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('ABCD-EFGH\nJKLM-NPQR');
  });
});

describe('Copy on the manual entry key', () => {
  it('says so when nothing could be copied', async () => {
    setClipboard(undefined);
    execCommand.mockReturnValue(false);
    render(<MemoryRouter><MFASetupPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'MyPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByAltText('MFA QR Code');

    fireEvent.click(screen.getByTitle('Copy secret'));

    expect(await screen.findByText('Copy failed. Select the key and copy it by hand.')).toBeInTheDocument();
  });
});

describe('Copy all on new backup codes from the Profile page', () => {
  it('copies over plain HTTP, and says so when it cannot', async () => {
    mfaRegenerateBackupCodes.mockResolvedValue({ message: 'ok', backupCodes: ['WXYZ-2345'] });
    mockUseAuth.mockReturnValue({ user: { platformRole: 'USER', mfaEnabled: true }, disableMFA: vi.fn() });
    setClipboard(undefined);
    execCommand.mockReturnValue(false);
    render(<MemoryRouter><MFASection /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: /backup codes/i }));
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'MyPassword123!' } });
    fireEvent.click(screen.getByRole('button', { name: /^regenerate$/i }));
    await screen.findByText('WXYZ-2345');

    fireEvent.click(screen.getByRole('button', { name: /copy all/i }));
    expect(await screen.findByText('Copy failed. Select the codes and copy them by hand.')).toBeInTheDocument();
  });
});
