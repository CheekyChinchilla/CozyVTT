/**
 * The settings form keeps what the DM is typing when the campaign is
 * refreshed in the background.
 *
 * The page now fetches the campaign again when someone joins or leaves and
 * after a reconnect, which hands the dialog a new campaign object. The form
 * re-seeded itself from the saved values on every such object, so a
 * description being typed went back to the saved one and the dialog jumped
 * to its first tab.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Campaign } from '@/types';

let current: Campaign;
const viewer = vi.hoisted(() => ({ role: 'DM', user: { id: 'dm', platformRole: 'USER' } }));
const updateCampaign = vi.hoisted(() => vi.fn());
const invitationsApi = vi.hoisted(() => ({ listCampaignInvitations: vi.fn(), withdrawCampaignInvitation: vi.fn() }));
vi.mock('@/services/api', () => ({ default: invitationsApi, api: invitationsApi }));
vi.mock('@/contexts/CampaignContext', () => ({ useCampaign: () => ({ campaign: current, refreshCampaign: vi.fn(), userRole: viewer.role }) }));
// Stable, as the real one is.
const showToast = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: viewer.user }) }));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/services/campaign.service', () => ({ default: { updateCampaign, deleteCampaign: vi.fn() } }));

beforeEach(() => {
  viewer.role = 'DM';
  viewer.user = { id: 'dm', platformRole: 'USER' };
  updateCampaign.mockReset().mockResolvedValue({});
  invitationsApi.listCampaignInvitations.mockReset().mockResolvedValue({ invitations: [] });
  invitationsApi.withdrawCampaignInvitation.mockReset().mockResolvedValue({ message: 'Invitation withdrawn' });
});

import CampaignSettingsModal from '../CampaignSettingsModal';

const campaign = (): Campaign => ({
  id: 'c1', name: 'The Keep', description: 'Saved words', chatCooldownEnabled: false, chatCooldownSeconds: 0,
  memberships: [], userRole: 'DM', ownerId: 'dm',
}) as unknown as Campaign;

describe('CampaignSettingsModal', () => {
  it('keeps an unsaved description when the campaign is fetched again', () => {
    current = campaign();
    const { rerender } = render(<CampaignSettingsModal isOpen onClose={() => undefined} />);
    const field = screen.getByPlaceholderText('Describe your campaign…') as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Half-written notes' } });

    // A roster change elsewhere: the same campaign, fetched again.
    current = campaign();
    rerender(<CampaignSettingsModal isOpen onClose={() => undefined} />);

    expect((screen.getByPlaceholderText('Describe your campaign…') as HTMLTextAreaElement).value).toBe('Half-written notes');
  });

  // An emptied box left the description out of the request, so the old one
  // stayed while the panel said the settings were saved.
  it('clears the description when the box is emptied', async () => {
    current = campaign();
    render(<CampaignSettingsModal isOpen onClose={() => undefined} />);
    fireEvent.change(screen.getByPlaceholderText('Describe your campaign…'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(updateCampaign).toHaveBeenCalledWith('c1', { name: 'The Keep', description: null }));
  });
});

// Only the owner or an administrator may delete a campaign, and the server
// refused anyone else; the Danger Zone, which holds only Delete Campaign, was
// offered to every DM, such as one the game was handed to.
describe('the Danger Zone', () => {
  const tabs = () => screen.queryByRole('button', { name: 'Danger Zone' });

  it('is not offered to a DM who is neither the owner nor an administrator', () => {
    current = { ...campaign(), ownerId: 'someone-else' } as Campaign;
    render(<CampaignSettingsModal isOpen onClose={() => undefined} />);
    expect(tabs()).toBeNull();
  });

  it.each([
    ['the owner, as DM', 'DM', 'USER', 'dm'],
    ['the owner, as a player after handing the seat over', 'PLAYER', 'USER', 'dm'],
    ['an administrator who does not own it', 'DM', 'ADMIN', 'someone-else'],
  ])('is offered to %s', (_who, role, platformRole, ownerId) => {
    viewer.role = role;
    viewer.user = { id: 'dm', platformRole };
    current = { ...campaign(), ownerId } as Campaign;
    render(<CampaignSettingsModal isOpen onClose={() => undefined} />);
    expect(tabs()).not.toBeNull();
  });
});

// A DM could not see who had been invited, nor take an invitation back.
describe('pending invitations', () => {
  it('lists them under Members and withdraws one', async () => {
    invitationsApi.listCampaignInvitations.mockResolvedValue({
      invitations: [{ id: 'inv-1', userId: 'u-gwen', createdAt: '2026-10-18T00:00:00.000Z', expiresAt: '2026-11-01T00:00:00.000Z', user: { displayName: 'Gwen' } }],
    });
    current = campaign();
    render(<CampaignSettingsModal isOpen onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));

    expect(await screen.findByText('Gwen')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw the invitation to Gwen' }));
    await waitFor(() => expect(invitationsApi.withdrawCampaignInvitation).toHaveBeenCalledWith('c1', 'inv-1'));
    await waitFor(() => expect(screen.queryByText('Gwen')).toBeNull());
  });
});
