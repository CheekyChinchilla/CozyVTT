/**
 * Sending an invitation from the campaign page leaves the page as it is.
 *
 * The page reloaded after every invitation sent, which dropped the DM's
 * connection, anything typed and the "Invitation sent." message, though
 * nothing on the campaign changes until the invitation is accepted.
 */

import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'c1', name: 'The Sunken Crown', status: 'ACTIVE', memberships: [], createdAt: '2026-10-01T00:00:00.000Z' },
    userRole: 'DM',
  }),
}));
vi.mock('../InvitePlayerModal', () => ({
  default: ({ onSuccess }: { onSuccess: () => void }) => <button onClick={onSuccess}>Send invitation</button>,
}));

import CampaignInfo from '../CampaignInfo';

const realLocation = window.location;

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

it('closes the invite dialog without reloading the page', () => {
  const reload = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, reload } });
  render(<CampaignInfo />);

  fireEvent.click(screen.getByRole('button', { name: /Invite Player/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));

  expect(reload).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Send invitation' })).toBeNull();
});
