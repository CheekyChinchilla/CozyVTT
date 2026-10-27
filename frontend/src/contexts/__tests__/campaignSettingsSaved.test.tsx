/**
 * The campaign page takes the Campaign Settings the DM saved.
 *
 * Every page kept the settings it loaded, so a chat cooldown the DM turned
 * on during play reached a player only as a refusal of their second message,
 * and their chat box never counted down until they reloaded. A save now sends
 * everyone `campaign.settings.updated`, and the page takes the name,
 * description, game system and chat cooldown from it.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const getCampaign = vi.fn();
vi.mock('@/services/campaign.service', () => ({ default: { getCampaign: (...a: unknown[]) => getCampaign(...a) } }));
vi.mock('@/services/api', () => ({
  default: { getMap: vi.fn().mockResolvedValue({ map: { id: 'm1', tokens: [] }, spiritVisible: false }), pingSession: vi.fn() },
  api: { getMap: vi.fn().mockResolvedValue({ map: { id: 'm1', tokens: [] }, spiritVisible: false }), pingSession: vi.fn() },
}));
const socketOn = vi.fn();
vi.mock('@/services/socket', () => ({
  default: {
    onCharacterHpUpdated: vi.fn(), onDmTransferred: vi.fn(), onMemberRoleChanged: vi.fn(),
    on: (...a: unknown[]) => socketOn(...a), off: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), getSocket: vi.fn().mockReturnValue(null),
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
    id: 'c1', name: 'The Sunken Crown', description: 'A crown', gameSystem: 'DND_5E', status: 'ACTIVE', currentMapId: null, maps: [],
    memberships: [{ userId: 'me', role: 'PLAYER' }], chatCooldownEnabled: false, chatCooldownSeconds: 5,
  });
  render(
    <MemoryRouter initialEntries={['/campaigns/c1']}>
      <Routes><Route path="/campaigns/:id" element={<CampaignProvider><Probe /></CampaignProvider>} /></Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(latest?.campaign?.id).toBe('c1'));
}

const saved = (data: unknown) => {
  const handler = socketOn.mock.calls.filter(([event]) => event === 'campaign.settings.updated').pop()?.[1] as ((d: unknown) => void) | undefined;
  expect(handler).toBeDefined();
  act(() => handler!(data));
};

const settings = { campaignId: 'c1', name: 'The Drowned Bell', description: '', gameSystem: 'DND_5E', chatCooldownEnabled: true, chatCooldownSeconds: 7 };

beforeEach(() => {
  latest = null;
  getCampaign.mockReset();
  socketOn.mockReset();
});

it('takes the chat cooldown, name and description the DM saved', async () => {
  await open();
  saved(settings);

  expect(latest!.campaign).toMatchObject({ name: 'The Drowned Bell', description: '', chatCooldownEnabled: true, chatCooldownSeconds: 7 });
  expect(latest!.campaign?.memberships).toEqual([{ userId: 'me', role: 'PLAYER' }]);
});

it("ignores another campaign's settings", async () => {
  await open();
  saved({ ...settings, campaignId: 'c2' });

  expect(latest!.campaign).toMatchObject({ name: 'The Sunken Crown', chatCooldownEnabled: false });
});

// A player's Draw button follows the setting, so it goes the moment the DM
// turns Players may draw off, and comes back when they turn it on.
it('takes whether players may draw', async () => {
  await open();
  saved({ ...settings, playersMayDraw: false });
  expect(latest!.campaign?.playersMayDraw).toBe(false);

  saved({ ...settings, playersMayDraw: true });
  expect(latest!.campaign?.playersMayDraw).toBe(true);
});
