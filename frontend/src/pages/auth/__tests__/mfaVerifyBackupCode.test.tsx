/**
 * The backup-code box can be corrected with Backspace.
 *
 * The box added a dash as soon as it held four characters without one, so
 * deleting the dash put it straight back and Backspace could never get below
 * "ABCD-". The dash now goes in when a fifth character is typed.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    mfaPending: true,
    authenticated: false,
    verifyMFA: vi.fn(),
    verifyMFAWithBackupCode: vi.fn(),
    cancelMFA: vi.fn(),
  }),
}));

import MFAVerifyPage from '../MFAVerifyPage';

async function backupCodeBox() {
  render(<MemoryRouter><MFAVerifyPage /></MemoryRouter>);
  await userEvent.click(screen.getByRole('button', { name: /use a backup code/i }));
  return screen.getByLabelText('Backup Code') as HTMLInputElement;
}

describe('the backup-code box', () => {
  it('can be backspaced past the dash', async () => {
    const box = await backupCodeBox();

    await userEvent.type(box, 'ABCDE');
    expect(box).toHaveValue('ABCD-E');

    await userEvent.type(box, '{Backspace}{Backspace}');
    expect(box).toHaveValue('ABCD');
    await userEvent.type(box, '{Backspace}');
    expect(box).toHaveValue('ABC');
  });

  it('puts the dash in a code typed or pasted without one', async () => {
    const box = await backupCodeBox();

    await userEvent.type(box, 'abcd2345');
    expect(box).toHaveValue('abcd-2345');
    expect(screen.getByRole('button', { name: 'Verify Backup Code' })).toBeEnabled();
  });
});
