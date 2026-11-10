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

import { describe, it, expect, expectTypeOf, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CampaignRole, type Campaign } from '@/types';
import type realApi from '@/services/api';
import { CAMPAIGN_LIMITS } from '@/constants/campaignLimits';

let current: Campaign;
const viewer = vi.hoisted(() => ({ role: 'DM', user: { id: 'dm', platformRole: 'USER' } }));
const updateCampaign = vi.hoisted(() => vi.fn());
const invitationsApi = vi.hoisted(() => ({
  listCampaignInvitations: vi.fn(), withdrawCampaignInvitation: vi.fn(), removeCampaignMember: vi.fn(), changeCampaignMemberRole: vi.fn(),
}));
vi.mock('@/services/api', () => ({ default: invitationsApi, api: invitationsApi }));
const refreshCampaign = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/CampaignContext', () => ({ useCampaign: () => ({ campaign: current, refreshCampaign, userRole: viewer.role }) }));
// Stable, as the real one is.
const showToast = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: viewer.user }) }));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));
const deleteCampaign = vi.hoisted(() => vi.fn());
vi.mock('@/services/campaign.service', () => ({ default: { updateCampaign, deleteCampaign } }));
// Invite Player asks whether the server can send email.
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

beforeEach(() => {
  viewer.role = 'DM';
  viewer.user = { id: 'dm', platformRole: 'USER' };
  updateCampaign.mockReset().mockResolvedValue({});
  invitationsApi.listCampaignInvitations.mockReset().mockResolvedValue({ invitations: [] });
  invitationsApi.withdrawCampaignInvitation.mockReset().mockResolvedValue({ message: 'Invitation withdrawn' });
  invitationsApi.removeCampaignMember.mockReset().mockResolvedValue({ message: 'Member removed' });
  invitationsApi.changeCampaignMemberRole.mockReset().mockResolvedValue({ message: 'Member role updated successfully' });
  refreshCampaign.mockReset().mockResolvedValue(undefined);
  showToast.mockReset();
});

import CampaignSettingsModal from '../CampaignSettingsModal';

const campaign = (): Campaign => ({
  id: 'c1', name: 'The Keep', description: 'Saved words', chatCooldownEnabled: false, chatCooldownSeconds: 0,
  memberships: [], userRole: 'DM', ownerId: 'dm',
}) as unknown as Campaign;

describe('CampaignSettingsModal', () => {
  it('keeps an unsaved description when the campaign is fetched again', () => {
    current = campaign();
    const { rerender } = render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);
    const field = screen.getByPlaceholderText('Describe your campaign…') as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Half-written notes' } });

    // A roster change elsewhere: the same campaign, fetched again.
    current = campaign();
    rerender(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);

    expect((screen.getByPlaceholderText('Describe your campaign…') as HTMLTextAreaElement).value).toBe('Half-written notes');
  });

  // An emptied box left the description out of the request, so the old one
  // stayed while the panel said the settings were saved.
  it('clears the description when the box is emptied', async () => {
    current = campaign();
    render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);
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
    render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);
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
    render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);
    expect(tabs()).not.toBeNull();
  });
});

// The owner was told twice: by the panel's own notice, and by the page's,
// which the server's word to every tab of the campaign brings. The panel
// hands its answer to the page's handler, which says a notice once.
describe('deleting the campaign', () => {
  it('hands its answer to the page and says nothing itself', async () => {
    current = campaign();
    deleteCampaign.mockReset().mockResolvedValue({});
    const onDeleted = vi.fn();
    render(<CampaignSettingsModal isOpen onClose={() => undefined} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Danger Zone' }));
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'The Keep' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Campaign' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Forever' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith({ campaignId: 'c1', reason: 'campaign-deleted', message: 'The Keep was deleted.' }));
    expect(showToast).not.toHaveBeenCalled();
  });
});

// A DM could not see who had been invited, nor take an invitation back.
describe('pending invitations', () => {
  it('lists them under Members and withdraws one', async () => {
    invitationsApi.listCampaignInvitations.mockResolvedValue({
      invitations: [{ id: 'inv-1', userId: 'u-gwen', createdAt: '2026-10-18T00:00:00.000Z', expiresAt: '2026-11-01T00:00:00.000Z', user: { displayName: 'Gwen' } }],
    });
    current = campaign();
    render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));

    expect(await screen.findByText('Gwen')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw the invitation to Gwen' }));
    await waitFor(() => expect(invitationsApi.withdrawCampaignInvitation).toHaveBeenCalledWith('c1', 'inv-1'));
    await waitFor(() => expect(screen.queryByText('Gwen')).toBeNull());
  });
});

// The boxes stopped at 100 and 1,000 characters, short of the server's 200
// and 5,000.
it('stops the name and description at the server\'s limits', () => {
  current = campaign();
  render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);
  expect((screen.getByPlaceholderText('My Campaign') as HTMLInputElement).maxLength).toBe(CAMPAIGN_LIMITS.maxNameLength);
  expect((screen.getByPlaceholderText('Describe your campaign…') as HTMLTextAreaElement).maxLength).toBe(CAMPAIGN_LIMITS.maxDescriptionLength);
  expect(screen.getByText(`11/${CAMPAIGN_LIMITS.maxDescriptionLength}`)).toBeTruthy();
});

// The panel had no dialog role, no Escape and no focus trap. Escape in a
// dialog the panel opens closes only that dialog.
describe('the Campaign Settings panel as a dialog', () => {
  it('is announced by name, and Escape and its Close button close it', () => {
    current = campaign();
    const onClose = vi.fn();
    render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Campaign Settings' });

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('closes only Invite Player on Escape', async () => {
    current = campaign();
    const onClose = vi.fn();
    render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));
    fireEvent.click(screen.getByRole('button', { name: /Invite Player/ }));
    const invite = await screen.findByRole('dialog', { name: 'Invite Player' });

    fireEvent.keyDown(invite, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Invite Player' })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Campaign Settings' })).toBeInTheDocument();
  });

  it('closes only the Remove Player confirmation on Escape', async () => {
    current = {
      ...campaign(),
      memberships: [{ userId: 'pia', role: 'PLAYER', user: { displayName: 'Pia' } }],
    } as unknown as Campaign;
    const onClose = vi.fn();
    render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pia from campaign' }));
    const confirm = await screen.findByRole('dialog', { name: 'Remove Player' });

    fireEvent.keyDown(confirm, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Remove Player' })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
  });
});

// Players may draw on the map unless the DM turns it off here; it takes
// effect at once, for a table in play.
describe('Players may draw', () => {
  const toggle = () => screen.getByRole('switch', { name: 'Players may draw' });

  it('shows the campaign’s setting, on unless the DM turned it off', () => {
    current = { ...campaign(), playersMayDraw: true } as Campaign;
    const { unmount } = render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);
    expect(toggle()).toHaveAttribute('aria-checked', 'true');
    unmount();

    current = { ...campaign(), playersMayDraw: false } as Campaign;
    render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);
    expect(toggle()).toHaveAttribute('aria-checked', 'false');
  });

  it('is saved as soon as it is switched, alone', async () => {
    current = { ...campaign(), playersMayDraw: true } as Campaign;
    render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);

    fireEvent.click(toggle());

    expect(toggle()).toHaveAttribute('aria-checked', 'false');
    await waitFor(() => expect(updateCampaign).toHaveBeenCalledWith('c1', { playersMayDraw: false }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Only you can draw on the map now', 'success'));
  });

  it('goes back as it was, saying why, when the save fails', async () => {
    current = { ...campaign(), playersMayDraw: true } as Campaign;
    updateCampaign.mockRejectedValueOnce(Object.assign(new Error('nope'), { response: { data: { message: 'The server is busy' } } }));
    render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);

    fireEvent.click(toggle());

    await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });
});

// A DM the game was handed to was offered Remove beside the owner, who sits
// at the table as a player, and the server then refused it.
describe('Remove under Members', () => {
  it('is not offered beside the owner, and is beside another player', () => {
    current = {
      ...campaign(),
      ownerId: 'owner-1',
      memberships: [
        { userId: 'owner-1', role: 'PLAYER', user: { displayName: 'Olwen' } },
        { userId: 'dm', role: 'DM', user: { displayName: 'Dain' } },
        { userId: 'player-1', role: 'PLAYER', user: { displayName: 'Pip' } },
      ],
    } as unknown as Campaign;
    render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));

    expect(screen.getByRole('button', { name: 'Remove Pip from campaign' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove Olwen from campaign' })).toBeNull();
  });
});

// The badge printed the stored role, so a player read PLAYER and a
// spectator SPECTATOR.
describe("Members' role badges", () => {
  // Seen by an owner who handed the seat over: the DM has the Role picker.
  it('name each role as the rest of the page does', () => {
    viewer.role = 'PLAYER';
    viewer.user = { id: 'pia', platformRole: 'USER' };
    current = {
      ...campaign(),
      ownerId: 'pia',
      memberships: [
        { userId: 'dm', role: 'DM', user: { displayName: 'Dain' } },
        { userId: 'pia', role: 'PLAYER', user: { displayName: 'Pia' } },
        { userId: 'sam', role: 'SPECTATOR', user: { displayName: 'Sam' } },
      ],
    } as unknown as Campaign;
    render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));

    /** The member's row, from the line that names them. */
    const row = (name: string) => {
      const found = screen.getByText(name).closest<HTMLElement>('.justify-between');
      if (!found) throw new Error(`no row for ${name}`);
      return found;
    };
    expect(within(row('Dain')).getByText('DM')).toBeTruthy();
    expect(within(row('Pia')).getByText('Player')).toBeTruthy();
    expect(within(row('Sam')).getByText('Spectator')).toBeTruthy();
  });
});

// Remove's question and its toast said "Player" whoever was removed, a
// spectator too.
describe("Remove's question and its toast", () => {
  const members = () => ({
    ...campaign(),
    memberships: [
      { userId: 'pia', role: 'PLAYER', user: { displayName: 'Pia' } },
      { userId: 'sam', role: 'SPECTATOR', user: { displayName: 'Sam' } },
    ],
  }) as unknown as Campaign;

  async function remove(name: string, title: string) {
    fireEvent.click(screen.getByRole('button', { name: `Remove ${name} from campaign` }));
    const confirm = await screen.findByRole('dialog', { name: title });
    expect(confirm).toHaveTextContent(`Remove ${name} from "The Keep"?`);
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
  }

  it('name a spectator a spectator', async () => {
    current = members();
    render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));

    await remove('Sam', 'Remove Spectator');

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Spectator removed from campaign', 'success'));
    expect(invitationsApi.removeCampaignMember).toHaveBeenCalledWith('c1', 'sam');
  });

  it('name a player a player, as before', async () => {
    current = members();
    render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));

    await remove('Pia', 'Remove Player');

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Player removed from campaign', 'success'));
  });
});

// The DM could make someone a spectator only by calling the server directly:
// every invitation makes a player, and nothing in the app changed a role.
describe('the Role picker under Members', () => {
  const table = (): Campaign => ({
    ...campaign(),
    ownerId: 'owner-1',
    memberships: [
      { userId: 'owner-1', role: 'PLAYER', user: { displayName: 'Olwen' } },
      { userId: 'dm', role: 'DM', user: { displayName: 'Dain' } },
      { userId: 'pia', role: 'PLAYER', user: { displayName: 'Pia' } },
      { userId: 'sam', role: 'SPECTATOR', user: { displayName: 'Sam' } },
    ],
  }) as unknown as Campaign;
  const picker = (name: string) => screen.getByRole<HTMLSelectElement>('combobox', { name: `Role of ${name}` });

  function openMembers() {
    render(<CampaignSettingsModal isOpen onDeleted={() => undefined} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Members' }));
  }

  it('asks for only the roles the server lets a DM give', () => {
    expectTypeOf<Parameters<typeof realApi.changeCampaignMemberRole>[2]>().toEqualTypeOf<CampaignRole.PLAYER | CampaignRole.SPECTATOR>();
  });

  it('offers Player and Spectator beside every member but the DM, the owner included', () => {
    current = table();
    openMembers();

    expect(picker('Pia').value).toBe(CampaignRole.PLAYER);
    expect(picker('Sam').value).toBe(CampaignRole.SPECTATOR);
    expect(picker('Olwen').value).toBe(CampaignRole.PLAYER);
    expect(within(picker('Pia')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Player', 'Spectator']);
    expect(screen.queryByRole('combobox', { name: 'Role of Dain' })).toBeNull();
  });

  it('is not offered to an owner who has handed the seat over', () => {
    viewer.role = 'PLAYER';
    viewer.user = { id: 'owner-1', platformRole: 'USER' };
    current = table();
    openMembers();

    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('changes the role, and the row keeps the new one once the server answers', async () => {
    current = table();
    let answer: (value: { message: string }) => void = () => undefined;
    invitationsApi.changeCampaignMemberRole.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    refreshCampaign.mockImplementation(async () => {
      current = {
        ...current,
        memberships: current.memberships?.map((m) => (m.userId === 'pia' ? { ...m, role: CampaignRole.SPECTATOR } : m)),
      };
    });
    openMembers();

    fireEvent.change(picker('Pia'), { target: { value: CampaignRole.SPECTATOR } });

    expect(invitationsApi.changeCampaignMemberRole).toHaveBeenCalledWith('c1', 'pia', CampaignRole.SPECTATOR);
    expect(picker('Pia').value).toBe(CampaignRole.SPECTATOR);
    expect(picker('Pia')).toHaveAttribute('aria-busy', 'true');

    answer({ message: 'Member role updated successfully' });

    await waitFor(() => expect(picker('Pia')).not.toHaveAttribute('aria-busy'));
    expect(refreshCampaign).toHaveBeenCalledTimes(1);
    expect(picker('Pia').value).toBe(CampaignRole.SPECTATOR);
    expect(showToast).toHaveBeenCalledWith('Pia is now a spectator', 'success');
  });

  it("says the server's refusal and goes back to the member's role", async () => {
    current = table();
    invitationsApi.changeCampaignMemberRole.mockRejectedValueOnce(
      Object.assign(new Error('Request failed'), { response: { status: 404, data: { message: 'User is not a member of this campaign' } } }),
    );
    openMembers();

    fireEvent.change(picker('Pia'), { target: { value: CampaignRole.SPECTATOR } });

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('User is not a member of this campaign', 'error'));
    expect(picker('Pia').value).toBe(CampaignRole.PLAYER);
    expect(picker('Pia')).not.toBeDisabled();
  });

  // A change made from the keyboard is sent at once. The picker was disabled
  // while it was asked, and a browser moves the focus off a control that is
  // disabled under it, so the DM lost their place in the list. jsdom does not
  // move the focus, so the picker must never be disabled while it holds it.
  it('keeps the focus on the picker while its change is asked, and sends no second change meanwhile', async () => {
    current = table();
    let answer: (value: { message: string }) => void = () => undefined;
    invitationsApi.changeCampaignMemberRole.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    openMembers();
    // The panel puts the focus on its first control a frame after it opens.
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    const pia = picker('Pia');
    pia.focus();

    fireEvent.change(pia, { target: { value: CampaignRole.SPECTATOR } });

    expect(pia).not.toBeDisabled();
    expect(pia).toHaveAttribute('aria-busy', 'true');
    expect(pia).toHaveFocus();

    fireEvent.change(pia, { target: { value: CampaignRole.PLAYER } });

    expect(invitationsApi.changeCampaignMemberRole).toHaveBeenCalledTimes(1);
    expect(pia.value).toBe(CampaignRole.SPECTATOR);

    answer({ message: 'Member role updated successfully' });

    await waitFor(() => expect(pia).not.toHaveAttribute('aria-busy'));
    expect(pia).not.toBeDisabled();
    expect(pia).toHaveFocus();
  });

  it('takes no change of role while the member is being removed, and stays enabled', async () => {
    current = table();
    invitationsApi.removeCampaignMember.mockImplementation(() => new Promise(() => undefined));
    openMembers();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Pia from campaign' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Remove Player' })).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(invitationsApi.removeCampaignMember).toHaveBeenCalled());

    const pia = picker('Pia');
    expect(pia).not.toBeDisabled();
    expect(pia).toHaveAttribute('aria-disabled', 'true');

    fireEvent.change(pia, { target: { value: CampaignRole.SPECTATOR } });

    expect(invitationsApi.changeCampaignMemberRole).not.toHaveBeenCalled();
    expect(pia.value).toBe(CampaignRole.PLAYER);
  });

  // The confirmation handed the focus back to Remove, which was disabled
  // while the member was removed, so the focus fell to the page and stayed
  // there once the row went.
  describe('the focus after a confirmed Remove', () => {
    function goesOnRemoval(userId: string) {
      refreshCampaign.mockImplementation(async () => {
        current = { ...current, memberships: current.memberships?.filter((m) => m.userId !== userId) };
      });
    }
    async function removeMember(name: string, title = 'Remove Player') {
      fireEvent.click(screen.getByRole('button', { name: `Remove ${name} from campaign` }));
      fireEvent.click(within(await screen.findByRole('dialog', { name: title })).getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(showToast).toHaveBeenCalled());
    }

    it("goes to the next member's first control", async () => {
      current = table();
      goesOnRemoval('pia');
      openMembers();
      await removeMember('Pia');

      await waitFor(() => expect(picker('Sam')).toHaveFocus());
      expect(document.activeElement).not.toBe(document.body);
    });

    it('goes to the member before when the last one is removed', async () => {
      current = table();
      goesOnRemoval('sam');
      openMembers();
      await removeMember('Sam', 'Remove Spectator');

      await waitFor(() => expect(picker('Pia')).toHaveFocus());
      expect(document.activeElement).not.toBe(document.body);
    });

    it('goes to Invite Player when no other member has a control', async () => {
      current = { ...campaign(), memberships: [
        { userId: 'dm', role: 'DM', user: { displayName: 'Dain' } },
        { userId: 'pia', role: 'PLAYER', user: { displayName: 'Pia' } },
      ] } as unknown as Campaign;
      goesOnRemoval('pia');
      openMembers();
      await removeMember('Pia');

      await waitFor(() => expect(screen.getByRole('button', { name: /Invite Player/ })).toHaveFocus());
      expect(document.activeElement).not.toBe(document.body);
    });

    it('goes back to Remove when the server refuses', async () => {
      current = table();
      invitationsApi.removeCampaignMember.mockRejectedValueOnce(new Error('Request failed'));
      openMembers();
      await removeMember('Pia');

      await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Pia from campaign' })).toHaveFocus());
    });
  });

  // The crown and the remove button were about 28 pixels square.
  it("gives every control on a member's row a finger's size on a touch screen", async () => {
    invitationsApi.listCampaignInvitations.mockResolvedValue({
      invitations: [{ id: 'inv-1', userId: 'u-gwen', createdAt: '2026-10-18T00:00:00.000Z', expiresAt: null, user: { displayName: 'Gwen' } }],
    });
    current = table();
    openMembers();

    const controls = [
      picker('Pia'),
      screen.getByRole('button', { name: 'Make Pia the Dungeon Master' }),
      screen.getByRole('button', { name: 'Remove Pia from campaign' }),
      await screen.findByRole('button', { name: 'Withdraw the invitation to Gwen' }),
    ];
    for (const control of controls) expect(control.className.split(/\s+/)).toContain('touch-target');
  });
});
