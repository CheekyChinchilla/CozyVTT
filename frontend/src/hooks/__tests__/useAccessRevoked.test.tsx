/**
 * The campaign page says why its table has ended, and leaves it.
 *
 * A member the DM removed, everyone in a campaign its owner deleted, and a
 * table whose sign-in ended elsewhere were told only through a socket
 * `error` that was written to the console, so the page sat on a dead
 * connection showing Connected. The server now sends
 * `campaign.access.revoked` with the reason, and the page shows it: a
 * removal or a deletion goes to the dashboard with a notice, and an ended
 * sign-in goes to the sign-in page, which shows the reason. Unsaved changes
 * in an editor keep the page where it is, as a lost sign-in already does.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
const loadPage = vi.fn();
vi.mock('@/services/pageLoad', () => ({ loadPage: (url: string) => loadPage(url) }));

import { useAccessRevoked } from '../useAccessRevoked';
import { holdUnsavedWork, isSignedOut } from '@/services/unsavedWork';
import { readSignInNotice, forgetSignInNotice } from '@/services/signInNotice';

let endTable: ((revoked: AccessRevoked) => void) | null = null;

function CampaignPage() {
  endTable = useAccessRevoked();
  return <p>Campaign page</p>;
}

let queryClient: QueryClient;

function renderCampaign() {
  return render(
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

/** The query keys marked for a refetch so far. */
function refetched(spy: ReturnType<typeof vi.spyOn>): unknown[] {
  return spy.mock.calls.map((call: unknown[]) => (call[0] as { queryKey: unknown }).queryKey);
}

function revoke(revoked: AccessRevoked) {
  act(() => { for (const handler of handlers) handler(revoked); });
}

beforeEach(() => {
  queryClient = new QueryClient();
  endTable = null;
  handlers.clear();
  showToast.mockReset();
  loadPage.mockReset();
  forgetSignInNotice();
  window.history.pushState({}, '', '/campaigns/c1');
});

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('a member removed from the campaign', () => {
  it('is told, and taken to the dashboard', () => {
    renderCampaign();

    revoke({ campaignId: 'c1', reason: 'removed', message: 'You were removed from this campaign.' });

    expect(showToast).toHaveBeenCalledWith('You were removed from this campaign.', 'warning', 10000);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  // The dashboard's lists are kept for 30 seconds, so one fetched just
  // before still showed the campaign's card, and not its notes.
  it("has the dashboard's lists fetched again", () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderCampaign();

    revoke({ campaignId: 'c1', reason: 'removed', message: 'You were removed from this campaign.' });

    expect(refetched(invalidate)).toEqual([['campaigns'], ['characters'], ['left-campaigns']]);
  });

  it('with unsaved changes in an editor stays, and is told to save them first', () => {
    const release = holdUnsavedWork();
    try {
      renderCampaign();

      revoke({ campaignId: 'c1', reason: 'removed', message: 'You were removed from this campaign.' });

      expect(showToast).toHaveBeenCalledWith(
        'You were removed from this campaign. Your unsaved changes are still open: save them before you leave this page.',
        'warning',
        10000
      );
      expect(screen.getByText('Campaign page')).toBeInTheDocument();
    } finally {
      release();
    }
  });
});

describe('a member who left the campaign', () => {
  it('is told, its lists on the dashboard are refetched, and it goes there', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderCampaign();

    revoke({ campaignId: 'c1', reason: 'left', message: 'You left this campaign.' });

    expect(showToast).toHaveBeenCalledWith('You left this campaign.', 'success', 10000);
    expect(refetched(invalidate)).toEqual([['campaigns'], ['characters'], ['left-campaigns']]);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  // The tab that pressed Leave Campaign is told by the server's answer and
  // by its socket; an editor's unsaved changes keep it on the page for both.
  it('is told once when the same notice comes twice', () => {
    const release = holdUnsavedWork();
    try {
      renderCampaign();

      act(() => endTable?.({ campaignId: 'c1', reason: 'left', message: 'You left this campaign.' }));
      revoke({ campaignId: 'c1', reason: 'left', message: 'You left this campaign.' });

      expect(showToast).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Campaign page')).toBeInTheDocument();
    } finally {
      release();
    }
  });
});

describe('a deleted campaign', () => {
  it('tells everyone at the table, and takes them to the dashboard', () => {
    renderCampaign();

    revoke({ campaignId: 'c1', reason: 'campaign-deleted', message: 'This campaign was deleted.' });

    expect(showToast).toHaveBeenCalledWith('This campaign was deleted.', 'warning', 10000);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it("has the dashboard's lists fetched again", () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderCampaign();

    revoke({ campaignId: 'c1', reason: 'campaign-deleted', message: 'This campaign was deleted.' });

    expect(refetched(invalidate)).toEqual([['campaigns'], ['characters'], ['left-campaigns']]);
  });
});

describe('a sign-in ended elsewhere', () => {
  it('goes to the sign-in page, which says why, and back here after', () => {
    renderCampaign();

    revoke({ campaignId: 'c1', reason: 'signed-out', message: 'Your password was changed on another device. Sign in again.' });

    expect(loadPage).toHaveBeenCalledWith('/auth/login?next=%2Fcampaigns%2Fc1');
    expect(readSignInNotice()).toBe('Your password was changed on another device. Sign in again.');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('with unsaved changes in an editor stays, and the editor says how to sign in again', () => {
    const release = holdUnsavedWork();
    try {
      renderCampaign();

      revoke({ campaignId: 'c1', reason: 'signed-out', message: 'You signed out.' });

      expect(loadPage).not.toHaveBeenCalled();
      expect(isSignedOut()).toBe(true);
    } finally {
      release();
    }
  });
});

it('stops listening when the page closes', () => {
  const view = renderCampaign();
  expect(handlers.size).toBe(1);
  view.unmount();
  expect(handlers.size).toBe(0);
});
