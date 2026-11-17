/**
 * An administrator sees every account's API keys and can revoke one, and
 * nothing else: no editing or replacing someone else's key.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ApiKeysPanel from '../ApiKeysPanel';
import type { ApiKey } from '@/types';

const listApiKeys = vi.fn();
const deleteApiKey = vi.fn();
vi.mock('@/services/api', () => {
  const client = {
    listApiKeys: (...a: unknown[]) => listApiKeys(...a),
    deleteApiKey: (...a: unknown[]) => deleteApiKey(...a),
  };
  return { api: client, default: client };
});

const KEY: ApiKey = {
  id: 'k1',
  userId: 'u2',
  owner: { displayName: 'Robin', email: 'robin@example.test' },
  name: 'Sheet sync',
  prefix: 'cozy_zzz9999',
  permissions: { '*': 'read' },
  createdAt: '2026-11-01T10:00:00.000Z',
  lastUsedAt: null,
  expiresAt: '2026-11-02T10:00:00.000Z',
  expired: true,
};

beforeEach(() => {
  listApiKeys.mockReset().mockResolvedValue({ apiKeys: [KEY] });
  deleteApiKey.mockReset().mockResolvedValue(undefined);
});

describe('ApiKeysPanel', () => {
  it('lists every account\'s keys with their owner, and offers only Revoke', async () => {
    render(<ApiKeysPanel />);
    const list = await screen.findByRole('list', { name: 'Every API key' });
    expect(listApiKeys).toHaveBeenCalledWith(true);
    expect(within(list).getByText(/Robin \(robin@example\.test\)/)).toBeInTheDocument();
    expect(within(list).getByText(/Everything: read/)).toBeInTheDocument();
    expect(within(list).getByText('Expired')).toBeInTheDocument();
    expect(within(list).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Revoke Sheet sync']);
  });

  it('revokes a key after asking', async () => {
    render(<ApiKeysPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Sheet sync' }));
    expect(screen.getByText(/The activity log records it/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(deleteApiKey).toHaveBeenCalledWith('k1'));
    expect(await screen.findByText('No account has an API key.')).toBeInTheDocument();
  });

  it('says why the list could not be read', async () => {
    listApiKeys.mockRejectedValueOnce({ response: { data: { message: 'Admin access required' } } });
    render(<ApiKeysPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Admin access required');
  });
});
