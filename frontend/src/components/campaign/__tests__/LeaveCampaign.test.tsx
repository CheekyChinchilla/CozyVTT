/**
 * A player or a spectator leaves the campaign from the Campaign Info panel.
 *
 * Only the DM could take a member out, so a spectator who no longer wanted
 * to watch had to ask for it. **Leave Campaign** asks first, then the
 * server takes them out; the DM and the owner, whom the server refuses, are
 * told how to get out instead. The tab that leaves hears it twice, from the
 * server's answer and from its socket, in either order, and says it once.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CampaignRole } from '@/types';
import type { AccessRevoked } from '@/types';

type Handler = (data: AccessRevoked) => void;
const handlers = new Set<Handler>();
vi.mock('@/services/socket', () => ({
  default: {
    on: (event: string, cb: Handler) => { if (event === 'campaign.access.revoked') handlers.add(cb); },
    off: (event: string, cb: Handler) => { if (event === 'campaign.access.revoked') handlers.delete(cb); },
  },
}));
const showToast = vi.fn();
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
let me = 'player-1';
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: me } }) }));
const leaveCampaign = vi.fn<(campaignId: string) => Promise<{ message: string }>>();
vi.mock('@/services/api', () => ({ api: { leaveCampaign: (campaignId: string) => leaveCampaign(campaignId) } }));

import LeaveCampaign from '../LeaveCampaign';
import { useAccessRevoked } from '@/hooks/useAccessRevoked';

const campaign = { id: 'c1', name: 'The Sunken Crown', ownerId: 'owner-1' };
const LEFT: AccessRevoked = { campaignId: 'c1', reason: 'left', message: 'You left this campaign.' };

/** A promise and the means to settle it, for the answer to arrive when a test says. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function renderAlone(userRole: CampaignRole, onLeft = vi.fn()) {
  render(<LeaveCampaign campaign={campaign} userRole={userRole} onLeft={onLeft} />);
  return onLeft;
}

/** The control on a campaign page that listens for the socket's notice, as CampaignPage does. */
function CampaignPage() {
  const endTable = useAccessRevoked();
  return <LeaveCampaign campaign={campaign} userRole={CampaignRole.PLAYER} onLeft={endTable} />;
}

let queryClient: QueryClient;

function renderOnPage() {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/campaigns/c1']}>
        <Routes>
          <Route path="/campaigns/:id" element={<CampaignPage />} />
          <Route path="/dashboard" element={<p>Dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function confirmLeave() {
  fireEvent.click(screen.getByRole('button', { name: 'Leave Campaign' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave Campaign' }));
}

function socketSays(revoked: AccessRevoked) {
  act(() => { for (const handler of handlers) handler(revoked); });
}

beforeEach(() => {
  me = 'player-1';
  handlers.clear();
  showToast.mockReset();
  leaveCampaign.mockReset();
  queryClient = new QueryClient();
});

describe('who is offered it', () => {
  it.each([CampaignRole.PLAYER, CampaignRole.SPECTATOR])('a %s is offered Leave Campaign', (role) => {
    renderAlone(role);
    expect(screen.getByRole('button', { name: 'Leave Campaign' })).toBeInTheDocument();
  });

  it('the DM is told to hand the seat over first', () => {
    renderAlone(CampaignRole.DM);
    expect(screen.queryByRole('button', { name: 'Leave Campaign' })).toBeNull();
    expect(screen.getByText(/hand the DM seat to another member first/)).toBeInTheDocument();
  });

  it('the owner sitting as a player is told they cannot leave, and how to delete it', () => {
    me = 'owner-1';
    renderAlone(CampaignRole.PLAYER);
    expect(screen.queryByRole('button', { name: 'Leave Campaign' })).toBeNull();
    expect(screen.getByText(/You own this campaign, so you cannot leave it/)).toHaveTextContent('Owner Settings');
  });

  it('the owner in the DM seat is told about owning it', () => {
    me = 'owner-1';
    renderAlone(CampaignRole.DM);
    expect(screen.getByText(/You own this campaign, so you cannot leave it/)).toHaveTextContent('Campaign Settings');
    expect(screen.queryByText(/hand the DM seat/)).toBeNull();
  });
});

describe('asking first', () => {
  it('says what goes, what stays and how to come back', () => {
    renderAlone(CampaignRole.PLAYER);
    fireEvent.click(screen.getByRole('button', { name: 'Leave Campaign' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Leave The Sunken Crown?')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Your characters in it go back to My Characters');
    expect(dialog).toHaveTextContent('Notes From Campaigns You Have Left');
    expect(dialog).toHaveTextContent('the DM has to invite you again');
  });

  it('sends nothing on Cancel', () => {
    const onLeft = renderAlone(CampaignRole.PLAYER);
    fireEvent.click(screen.getByRole('button', { name: 'Leave Campaign' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(leaveCampaign).not.toHaveBeenCalled();
    expect(onLeft).not.toHaveBeenCalled();
  });

  it('leaves on Leave Campaign, and passes on what the server said', async () => {
    leaveCampaign.mockResolvedValue({ message: 'You left this campaign.' });
    const onLeft = renderAlone(CampaignRole.PLAYER);

    confirmLeave();

    await waitFor(() => expect(onLeft).toHaveBeenCalledWith(LEFT));
    expect(leaveCampaign).toHaveBeenCalledWith('c1');
  });

  it("shows the server's refusal and stays", async () => {
    leaveCampaign.mockRejectedValue({ response: { status: 409, data: { message: 'You run this campaign. Hand the DM seat to someone else in the campaign\'s settings, then leave it.' } } });
    const onLeft = renderAlone(CampaignRole.PLAYER);

    confirmLeave();

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      "You run this campaign. Hand the DM seat to someone else in the campaign's settings, then leave it.",
      'error'
    ));
    expect(onLeft).not.toHaveBeenCalled();
    // Still offered; the dialog's own button may be fading out beside it.
    const offered = screen.getAllByRole('button', { name: 'Leave Campaign' }).filter((b) => !b.closest('[role="dialog"]'));
    expect(offered).toHaveLength(1);
  });
});

describe('the tab that leaves', () => {
  it("says it once when the socket's notice comes before the answer", async () => {
    const answer = later<{ message: string }>();
    leaveCampaign.mockReturnValue(answer.promise);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderOnPage();

    confirmLeave();
    socketSays(LEFT);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    await act(async () => { answer.resolve({ message: 'You left this campaign.' }); await answer.promise; });

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('You left this campaign.', 'success', 10000);
    expect(invalidate.mock.calls.map((call) => call[0]?.queryKey)).toEqual([['campaigns'], ['characters'], ['left-campaigns']]);
  });

  it("says it once when the answer comes before the socket's notice", async () => {
    const answer = later<{ message: string }>();
    leaveCampaign.mockReturnValue(answer.promise);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderOnPage();

    confirmLeave();
    await act(async () => { answer.resolve({ message: 'You left this campaign.' }); await answer.promise; });
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    socketSays(LEFT);

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('You left this campaign.', 'success', 10000);
    expect(invalidate.mock.calls.map((call) => call[0]?.queryKey)).toEqual([['campaigns'], ['characters'], ['left-campaigns']]);
  });
});
