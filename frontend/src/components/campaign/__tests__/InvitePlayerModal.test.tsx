/**
 * The Invite Player dialog searches for people by name.
 *
 * It used to load every account on the instance into one dropdown. The server
 * now answers only a search of at least two characters, with at most 20
 * matches, so the dialog asks for part of a name and lists what comes back.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import InvitePlayerModal from '../InvitePlayerModal';

vi.mock('@/services/api', () => {
  const client = { listInvitableUsers: vi.fn(), inviteUserToCampaign: vi.fn() };
  return { api: client, default: client };
});
const showToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: { smtp: { configured: true } } }) }));

import { api } from '@/services/api';
const listInvitableUsers = api.listInvitableUsers as ReturnType<typeof vi.fn>;
const inviteUserToCampaign = api.inviteUserToCampaign as ReturnType<typeof vi.fn>;

const alice = { id: 'u-alice', displayName: 'Alice', avatarUrl: null };
const alicia = { id: 'u-alicia', displayName: 'Alicia', avatarUrl: '/api/assets/avatars/u-alicia' };

function open() {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  render(<InvitePlayerModal campaignId="camp-1" onClose={onClose} onSuccess={onSuccess} />);
  return { onSuccess, onClose };
}

const searchBox = () => screen.getByLabelText('Search by display name');

beforeEach(() => {
  vi.clearAllMocks();
  listInvitableUsers.mockResolvedValue({ users: [alice, alicia], hasMore: false });
  inviteUserToCampaign.mockResolvedValue({ message: 'Invitation sent successfully', emailSent: false });
});

describe('InvitePlayerModal', () => {
  it('asks for two letters and lists nobody until then', async () => {
    open();
    expect(screen.getByText('Type at least 2 letters of their display name.')).toBeTruthy();
    fireEvent.change(searchBox(), { target: { value: 'a' } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(listInvitableUsers).not.toHaveBeenCalled();
  });

  it('searches as you type and lists the matches with their pictures', async () => {
    open();
    fireEvent.change(searchBox(), { target: { value: 'ali' } });

    expect(await screen.findByRole('radio', { name: 'Alice' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Alicia' })).toBeTruthy();
    expect(listInvitableUsers).toHaveBeenLastCalledWith('camp-1', 'ali');
    // The picture tells two people of the same name apart.
    const picture = screen.getByRole('radio', { name: 'Alicia' }).closest('label')?.querySelector('img');
    expect(picture?.getAttribute('src')).toBe('/api/assets/avatars/u-alicia');
  });

  it('invites the person picked', async () => {
    const { onSuccess } = open();
    fireEvent.change(searchBox(), { target: { value: 'ali' } });
    fireEvent.click(await screen.findByRole('radio', { name: 'Alicia' }));
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }));

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(inviteUserToCampaign).toHaveBeenCalledWith('camp-1', 'u-alicia', false);
  });

  it('says when more people match than are shown', async () => {
    listInvitableUsers.mockResolvedValue({ users: [alice], hasMore: true });
    open();
    fireEvent.change(searchBox(), { target: { value: 'al' } });
    expect(await screen.findByText('Showing the first 20 matches. Type more of the name to narrow it down.')).toBeTruthy();
  });

  it('says when nobody matches', async () => {
    listInvitableUsers.mockResolvedValue({ users: [], hasMore: false });
    open();
    fireEvent.change(searchBox(), { target: { value: 'zz' } });
    expect(await screen.findByText(/No one by that name can be invited/)).toBeTruthy();
  });
});
