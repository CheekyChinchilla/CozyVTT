/**
 * The campaign page follows a member's change of role while it is open.
 *
 * The GM's Role picker, under Members in Campaign Settings, changes a role
 * while the member may be at the table. The server sends everyone in the
 * campaign `campaign.role.changed`, and the page patches its member list:
 * `userRole`, and every control that asks it, is read from that list, so the
 * member's own page takes the new role without a reload.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { CampaignRole, type MemberRoleChangedBroadcast } from '@/types';

const getCampaign = vi.fn();
vi.mock('@/services/campaign.service', () => ({ default: { getCampaign: (...a: unknown[]) => getCampaign(...a) } }));
vi.mock('@/services/api', () => ({
  default: { getMap: vi.fn().mockResolvedValue({ map: { id: 'm1', tokens: [] }, spiritVisible: false }), pingSession: vi.fn() },
  api: { getMap: vi.fn().mockResolvedValue({ map: { id: 'm1', tokens: [] }, spiritVisible: false }), pingSession: vi.fn() },
}));
const onMemberRoleChanged = vi.hoisted(() => vi.fn<(callback: (data: MemberRoleChangedBroadcast) => void) => void>());
vi.mock('@/services/socket', () => ({
  default: {
    onCharacterHpUpdated: vi.fn(), onGmTransferred: vi.fn(), onMemberRoleChanged,
    on: vi.fn(), off: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), getSocket: vi.fn().mockReturnValue(null),
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

import { CampaignProvider, useCampaign } from '../CampaignContext';

let latest: ReturnType<typeof useCampaign> | null = null;
function Probe() {
  latest = useCampaign();
  return null;
}

async function open() {
  getCampaign.mockResolvedValueOnce({
    id: 'c1', name: 'The Sunken Crown', description: '', gameSystem: 'FIFTH_EDITION', status: 'ACTIVE', currentMapId: null, maps: [],
    memberships: [
      { userId: 'dm', role: 'GM' },
      { userId: 'me', role: 'PLAYER' },
      { userId: 'pip', role: 'PLAYER' },
    ],
    chatCooldownEnabled: false, chatCooldownSeconds: 5,
  });
  render(
    <MemoryRouter initialEntries={['/campaigns/c1']}>
      <Routes><Route path="/campaigns/:id" element={<CampaignProvider><Probe /></CampaignProvider>} /></Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(latest?.campaign?.id).toBe('c1'));
}

const changed = (data: MemberRoleChangedBroadcast) => {
  const calls = onMemberRoleChanged.mock.calls;
  const handler = calls[calls.length - 1]?.[0];
  if (!handler) throw new Error('the page does not listen for role changes');
  act(() => handler(data));
};

const roleOf = (userId: string) => latest!.campaign?.memberships?.find((m) => m.userId === userId)?.role;

beforeEach(() => {
  latest = null;
  getCampaign.mockReset();
  onMemberRoleChanged.mockReset();
});

it("takes this member's own new role, and gives it back", async () => {
  await open();
  expect(latest!.userRole).toBe(CampaignRole.PLAYER);

  changed({ campaignId: 'c1', userId: 'me', role: CampaignRole.SPECTATOR });
  expect(latest!.userRole).toBe(CampaignRole.SPECTATOR);
  expect(roleOf('me')).toBe(CampaignRole.SPECTATOR);

  changed({ campaignId: 'c1', userId: 'me', role: CampaignRole.PLAYER });
  expect(latest!.userRole).toBe(CampaignRole.PLAYER);
});

it("takes another member's new role and leaves this member's", async () => {
  await open();

  changed({ campaignId: 'c1', userId: 'pip', role: CampaignRole.SPECTATOR });

  expect(roleOf('pip')).toBe(CampaignRole.SPECTATOR);
  expect(latest!.userRole).toBe(CampaignRole.PLAYER);
});

it("ignores a change in another campaign", async () => {
  await open();

  changed({ campaignId: 'c2', userId: 'me', role: CampaignRole.SPECTATOR });

  expect(latest!.userRole).toBe(CampaignRole.PLAYER);
});
