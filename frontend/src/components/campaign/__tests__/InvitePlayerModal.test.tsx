/**
 * The Invite Player dialog searches for people by name.
 *
 * It used to load every account on the instance into one dropdown. The server
 * now answers only a search, with at most 20 matches: two or more characters
 * find names that contain them, and one character finds names that are
 * exactly it. The dialog asks for a name and lists what comes back.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  it('says what to type, and searches nothing until something is typed', async () => {
    open();
    expect(
      screen.getByText('Type at least 2 letters of their display name, or the whole name if it is one letter long.')
    ).toBeTruthy();
    fireEvent.change(searchBox(), { target: { value: '   ' } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(listInvitableUsers).not.toHaveBeenCalled();
  });

  it('finds someone whose whole name is one letter', async () => {
    listInvitableUsers.mockResolvedValue({ users: [{ id: 'u-j', displayName: 'J', avatarUrl: null }], hasMore: false });
    open();
    fireEvent.change(searchBox(), { target: { value: 'j' } });

    expect(await screen.findByRole('radio', { name: 'J' })).toBeTruthy();
    expect(listInvitableUsers).toHaveBeenLastCalledWith('camp-1', 'j');
  });

  it('says a single letter finds only that whole name when nobody has it', async () => {
    listInvitableUsers.mockResolvedValue({ users: [], hasMore: false });
    open();
    fireEvent.change(searchBox(), { target: { value: 'a' } });
    expect(
      await screen.findByText('No one called \u201ca\u201d can be invited. Type 2 or more letters to search for part of a name.')
    ).toBeTruthy();
    expect(screen.queryByText(/No one by that name can be invited/)).toBeNull();
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
    // An invitation from the app runs out after 14 days.
    expect(inviteUserToCampaign).toHaveBeenCalledWith('camp-1', 'u-alicia', false, 14);
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

// It was mounted only while open, so it vanished on close with no fade.
describe('closing', () => {
  it('fades out, staying on screen until it has', async () => {
    const view = render(<InvitePlayerModal open campaignId="camp-1" onClose={vi.fn()} onSuccess={vi.fn()} />);
    view.rerender(<InvitePlayerModal open={false} campaignId="camp-1" onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Invite Player' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Invite Player' })).toBeNull());
  });
});
