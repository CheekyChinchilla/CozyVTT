/**
 * The API key settings: a person lists their keys by name and prefix, makes
 * one and sees it once, changes, replaces and revokes keys, and an editor
 * offers only the levels their account can use.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ApiKeysSection from '../ApiKeysSection';
import type { ApiKey, ApiKeyPermission } from '@/types';

const listApiKeys = vi.fn();
const listApiKeyPermissions = vi.fn();
const createApiKey = vi.fn();
const updateApiKey = vi.fn();
const regenerateApiKey = vi.fn();
const deleteApiKey = vi.fn();
vi.mock('@/services/api', () => {
  const client = {
    listApiKeys: (...a: unknown[]) => listApiKeys(...a),
    listApiKeyPermissions: (...a: unknown[]) => listApiKeyPermissions(...a),
    createApiKey: (...a: unknown[]) => createApiKey(...a),
    updateApiKey: (...a: unknown[]) => updateApiKey(...a),
    regenerateApiKey: (...a: unknown[]) => regenerateApiKey(...a),
    deleteApiKey: (...a: unknown[]) => deleteApiKey(...a),
  };
  return { api: client, default: client };
});

const copyText = vi.fn();
vi.mock('@/utils/clipboard', () => ({ copyText: (...a: unknown[]) => copyText(...a) }));

const PERMISSIONS: ApiKeyPermission[] = [
  { id: 'campaigns', name: 'Campaigns', description: 'Details and members', group: 'campaigns', levels: ['none', 'read', 'write'] },
  { id: 'maps', name: 'Maps', description: 'Maps and tokens', group: 'campaigns', levels: ['none', 'read', 'write'] },
  { id: 'admin-overview', name: 'Overview', description: 'Statistics', group: 'admin', levels: ['none', 'read'] },
];

const KEY: ApiKey = {
  id: 'k1',
  userId: 'u1',
  name: 'Discord bot',
  prefix: 'cozy_abc1234',
  permissions: { campaigns: 'read' },
  createdAt: '2026-11-01T10:00:00.000Z',
  lastUsedAt: null,
  expiresAt: null,
  expired: false,
};

beforeEach(() => {
  listApiKeys.mockReset().mockResolvedValue({ apiKeys: [KEY] });
  listApiKeyPermissions.mockReset().mockResolvedValue({ permissions: PERMISSIONS });
  createApiKey.mockReset();
  updateApiKey.mockReset();
  regenerateApiKey.mockReset();
  deleteApiKey.mockReset();
  copyText.mockReset().mockResolvedValue(true);
});

describe('ApiKeysSection', () => {
  it('lists each key by name and prefix, never the key', async () => {
    render(<ApiKeysSection />);
    const list = await screen.findByRole('list', { name: 'Your API keys' });
    expect(within(list).getByText('Discord bot')).toBeInTheDocument();
    expect(within(list).getByText('cozy_abc1234…')).toBeInTheDocument();
    expect(within(list).getByText('1 permission')).toBeInTheDocument();
    expect(within(list).getByText('Never used')).toBeInTheDocument();
    expect(within(list).getByText('Never expires')).toBeInTheDocument();
  });

  it('says so when there are no keys, and offers to try again after a failure', async () => {
    listApiKeys.mockResolvedValueOnce({ apiKeys: [] });
    const { unmount } = render(<ApiKeysSection />);
    expect(await screen.findByText('You have no API keys yet.')).toBeInTheDocument();
    unmount();

    listApiKeys.mockRejectedValueOnce({ response: { data: { message: 'Server unreachable' } } });
    render(<ApiKeysSection />);
    expect(await screen.findByText('Server unreachable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New key' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Discord bot')).toBeInTheDocument();
  });

  it('makes a key with a 90-day expiry by default, and shows it once', async () => {
    createApiKey.mockResolvedValue({ apiKey: { ...KEY, id: 'k2', name: 'Importer', prefix: 'cozy_new0000' }, key: 'cozy_new0000secret' });
    render(<ApiKeysSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'New key' }));

    const dialog = await screen.findByRole('dialog', { name: 'New API key' });
    expect(within(dialog).getByLabelText('Expires')).toHaveValue('90');
    // Administration levels are offered as the server says: Read only.
    const stats = within(dialog).getByRole('radiogroup', { name: 'Overview' });
    expect(within(stats).getAllByRole('radio').map((r) => r.textContent)).toEqual(['No access', 'Read']);

    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: '  Importer ' } });
    fireEvent.click(within(within(dialog).getByRole('radiogroup', { name: 'Maps' })).getByRole('radio', { name: 'Read & write' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create key' }));

    await waitFor(() => expect(createApiKey).toHaveBeenCalled());
    const sent = createApiKey.mock.calls[0][0];
    expect(sent).toMatchObject({ name: 'Importer', permissions: { maps: 'write' } });
    const days = (new Date(sent.expiresAt).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThan(90.1);

    const reveal = await screen.findByRole('dialog', { name: 'Your API key' });
    expect(within(reveal).getByLabelText('API key')).toHaveValue('cozy_new0000secret');
    fireEvent.click(within(reveal).getByRole('button', { name: 'Copy' }));
    expect(await within(reveal).findByText('Copied!')).toBeInTheDocument();
    expect(copyText).toHaveBeenCalledWith('cozy_new0000secret');

    // Escape does not throw the key away; Done does.
    fireEvent.keyDown(reveal, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Your API key' })).toBeInTheDocument();
    fireEvent.click(within(reveal).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Your API key' })).not.toBeInTheDocument());
    expect(screen.queryByDisplayValue('cozy_new0000secret')).not.toBeInTheDocument();
    expect(screen.getByText('Importer')).toBeInTheDocument();
  });

  it('tells the person when the copy failed', async () => {
    copyText.mockResolvedValue(false);
    regenerateApiKey.mockResolvedValue({ apiKey: KEY, key: 'cozy_replaced' });
    render(<ApiKeysSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate Discord bot' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Regenerate' }));
    const reveal = await screen.findByRole('dialog', { name: 'Your new key' });
    expect(within(reveal).getByText(/the key it replaces has stopped working/)).toBeInTheDocument();
    fireEvent.click(within(reveal).getByRole('button', { name: 'Copy' }));
    expect(await within(reveal).findByText(/Copy failed/)).toBeInTheDocument();
  });

  it('shows the levels under "Everything" as given, and lets a permission rise above it', async () => {
    render(<ApiKeysSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'New key' }));
    const dialog = await screen.findByRole('dialog', { name: 'New API key' });
    fireEvent.click(within(within(dialog).getByRole('radiogroup', { name: 'Everything' })).getByRole('radio', { name: 'Read' }));

    const maps = within(dialog).getByRole('radiogroup', { name: 'Maps' });
    expect(within(maps).getByRole('radio', { name: 'No access' })).toBeDisabled();
    expect(within(maps).getByRole('radio', { name: 'Read' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(maps).getByRole('radio', { name: 'Read & write' }));
    expect(within(maps).getByRole('radio', { name: 'Read & write' })).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps a key\'s expiry when editing unless told otherwise, and shows the server\'s refusal', async () => {
    updateApiKey.mockRejectedValueOnce({ response: { data: { message: 'Level "write" is not available for maps' } } });
    updateApiKey.mockResolvedValueOnce({ apiKey: { ...KEY, name: 'Renamed' } });
    render(<ApiKeysSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Discord bot' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit API key' });
    expect(within(dialog).getByLabelText('Expires')).toHaveValue('keep');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Renamed' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('not available for maps');
    expect(updateApiKey.mock.calls[0][1]).not.toHaveProperty('expiresAt');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Renamed')).toBeInTheDocument();
  });

  it('drops on save a permission the account is no longer offered, and says so', async () => {
    listApiKeys.mockResolvedValue({ apiKeys: [{ ...KEY, permissions: { campaigns: 'read', 'admin-users': 'read' } }] });
    updateApiKey.mockResolvedValue({ apiKey: KEY });
    render(<ApiKeysSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Discord bot' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit API key' });
    expect(within(dialog).getByText(/a permission your account can no longer use/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateApiKey).toHaveBeenCalled());
    expect(updateApiKey.mock.calls[0][1].permissions).toEqual({ campaigns: 'read' });
  });

  it('leaves the administration permissions alone under "Everything"', async () => {
    render(<ApiKeysSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'New key' }));
    const dialog = await screen.findByRole('dialog', { name: 'New API key' });
    fireEvent.click(within(within(dialog).getByRole('radiogroup', { name: 'Everything' })).getByRole('radio', { name: 'Read' }));
    const stats = within(dialog).getByRole('radiogroup', { name: 'Overview' });
    expect(within(stats).getByRole('radio', { name: 'No access' })).toHaveAttribute('aria-checked', 'true');
    expect(within(stats).getByRole('radio', { name: 'No access' })).toBeEnabled();
  });

  it('will not regenerate an expired key', async () => {
    listApiKeys.mockResolvedValue({ apiKeys: [{ ...KEY, expired: true, expiresAt: '2026-11-02T12:00:00.000Z' }] });
    render(<ApiKeysSection />);
    expect(await screen.findByRole('button', { name: 'Regenerate Discord bot' })).toBeDisabled();
  });

  it('revokes a key after asking', async () => {
    deleteApiKey.mockResolvedValue(undefined);
    render(<ApiKeysSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Discord bot' }));
    expect(deleteApiKey).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(deleteApiKey).toHaveBeenCalledWith('k1'));
    expect(await screen.findByText('You have no API keys yet.')).toBeInTheDocument();
  });
});
