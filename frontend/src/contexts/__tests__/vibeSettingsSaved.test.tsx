/**
 * The campaign page takes the vibe periods the DM saved.
 *
 * Every page kept the periods it loaded, so an edit to the period in force
 * changed nothing on screen until a reload, a period added and switched to
 * showed "No vibe set" to the players, and a period renamed or deleted kept
 * its tint. A save now sends everyone `vibe.settings.updated`, with the
 * periods as saved and the vibe they leave, and the page takes both: the
 * tracker's periods, the vibe, and its tint.
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
    on: (...a: unknown[]) => socketOn(...a), off: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), getSocket: vi.fn().mockReturnValue(null), startHeartbeat: vi.fn(),
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

import { CampaignProvider, useCampaign } from '../CampaignContext';

const dawn = { name: 'Dawn', hue: '#FFB347', filter: 'sepia(0.2)', audio: null };
const dusk = { name: 'Dusk', hue: '#8E7CC3', filter: 'none', audio: null };

let latest: ReturnType<typeof useCampaign> | null = null;
function Probe() {
  latest = useCampaign();
  return null;
}

async function open() {
  getCampaign.mockResolvedValueOnce({
    id: 'c1', name: 'Vibes', status: 'ACTIVE', currentMapId: null, maps: [], memberships: [{ userId: 'me', role: 'PLAYER' }],
    currentVibe: 'Dawn', vibeSettings: { enabled: true, periods: [dawn, dusk] },
  });
  render(
    <MemoryRouter initialEntries={['/campaigns/c1']}>
      <Routes><Route path="/campaigns/:id" element={<CampaignProvider><Probe /></CampaignProvider>} /></Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(latest?.activeVibeEffect).toEqual({ hue: '#FFB347', filter: 'sepia(0.2)' }));
}

const saved = (data: unknown) => {
  const handler = socketOn.mock.calls.filter(([event]) => event === 'vibe.settings.updated').pop()?.[1] as (d: unknown) => void;
  act(() => handler(data));
};

beforeEach(() => {
  latest = null;
  getCampaign.mockReset();
  socketOn.mockReset();
});

it('shows the new colour of the period in force', async () => {
  await open();
  saved({ campaignId: 'c1', currentVibe: 'Dawn', vibeSettings: { enabled: true, periods: [{ ...dawn, hue: '#FF0000' }, dusk] } });

  expect(latest!.currentVibe).toBe('Dawn');
  expect(latest!.activeVibeEffect).toEqual({ hue: '#FF0000', filter: 'sepia(0.2)' });
  expect(latest!.campaign?.vibeSettings?.periods[0].hue).toBe('#FF0000');
});

it('takes the periods added, so a switch to one of them is shown', async () => {
  await open();
  const night = { name: 'Night', hue: '#1A237E', filter: 'none', audio: null };
  saved({ campaignId: 'c1', currentVibe: 'Dawn', vibeSettings: { enabled: true, periods: [dawn, dusk, night] } });

  expect(latest!.campaign?.vibeSettings?.periods.map((p) => p.name)).toEqual(['Dawn', 'Dusk', 'Night']);
});

it('ends the vibe and its tint when the period in force is gone', async () => {
  await open();
  saved({ campaignId: 'c1', currentVibe: null, vibeSettings: { enabled: true, periods: [dusk] } });

  expect(latest!.currentVibe).toBeNull();
  expect(latest!.activeVibeEffect).toBeNull();
});

it('ignores a save for another campaign', async () => {
  await open();
  saved({ campaignId: 'c2', currentVibe: null, vibeSettings: { enabled: true, periods: [dusk] } });

  expect(latest!.currentVibe).toBe('Dawn');
  expect(latest!.activeVibeEffect).toEqual({ hue: '#FFB347', filter: 'sepia(0.2)' });
});
