/**
 * Regenerated backup codes are shown as the server sends them.
 *
 * The server sends each code already split, as ABCD-EFGH. The profile split
 * it again, so it showed ABCD--EFGH, which the sign-in box refused.
 */
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', mfaEnabled: true } }),
}));
const mfaRegenerateBackupCodes = vi.fn().mockResolvedValue({ message: 'ok', backupCodes: ['ABCD-EFGH', 'JKLM-NPQR'] });
vi.mock('@/services/api', () => {
  const client = { mfaRegenerateBackupCodes: (...a: unknown[]) => mfaRegenerateBackupCodes(...a) };
  return { api: client, default: client };
});

import MFASection from '../MFASection';

it('shows each regenerated code as the server sends it', async () => {
  render(<MemoryRouter><MFASection /></MemoryRouter>);
  fireEvent.click(screen.getByText('Backup Codes'));
  fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'MyPassword123!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

  expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument();
  expect(screen.getByText('JKLM-NPQR')).toBeInTheDocument();
  expect(screen.queryByText(/--/)).not.toBeInTheDocument();
});
