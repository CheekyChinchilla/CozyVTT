/**
 * The dashboard's invitations catch up when the player comes back to it.
 *
 * The dashboard has no live connection, and the app's queries do not refetch
 * when the window regains focus, so an invitation sent while the dashboard
 * was open appeared only after Refresh. The invitations alone are fetched
 * again when the page regains focus, and every minute while it is open.
 */

import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { queryClient as appClient } from '@/lib/queryClient';

const getPendingInvitations = vi.hoisted(() => vi.fn());
vi.mock('@/services/api', () => ({ default: { getPendingInvitations }, api: { getPendingInvitations } }));

import { usePendingInvitationsQuery } from '..';

function Count() {
  const { data } = usePendingInvitationsQuery();
  return <p>{data ? `${data.length} invitations` : 'loading'}</p>;
}

afterEach(() => {
  focusManager.setFocused(undefined);
});

it('fetches the invitations again when the page regains focus', async () => {
  getPendingInvitations.mockResolvedValueOnce([]).mockResolvedValue([{ id: 'inv-1' }]);
  // The app's own defaults: no refetch on focus for anything else.
  const client = new QueryClient({ defaultOptions: appClient.getDefaultOptions() });
  render(<QueryClientProvider client={client}><Count /></QueryClientProvider>);
  expect(await screen.findByText('0 invitations')).toBeTruthy();

  act(() => { focusManager.setFocused(false); });
  act(() => { focusManager.setFocused(true); });
  await waitFor(() => expect(screen.getByText('1 invitations')).toBeTruthy());
});
