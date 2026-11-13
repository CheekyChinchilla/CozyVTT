/**
 * Editing a creature stored with a game system CozyVTT no longer supports
 * leaves its system as stored.
 *
 * The form names the campaign's system as the app plays it, which is none
 * for such a campaign, and sent that with every save, so the server stored
 * none in place of the creature's own value. A save of such a creature now
 * leaves the game system out, and the server keeps what it holds.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreatureTemplate } from '@/types';

/** A code this build does not know, as a row stored with the unreleased system holds one. */
const UNKNOWN = 'NOT_A_SYSTEM';

const campaign = vi.hoisted(() => ({ gameSystem: 'FIFTH_EDITION' as string | null }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', gameSystem: campaign.gameSystem }, currentMap: null, viewedMap: null }),
}));
vi.mock('@/components/assets/AssetPicker', () => ({ default: () => null }));

const api = vi.hoisted(() => ({
  listCreatures: vi.fn(),
  getSeedStatus: vi.fn(),
  listCreatureFavorites: vi.fn(),
  updateCreature: vi.fn(),
}));
vi.mock('@/services/api', () => ({ api, default: api }));

import CreatureLibrary from '../CreatureLibrary';

const creature = (gameSystem: string | null) => ({
  id: 'c1', name: 'Marsh Lurker', source: 'custom', challengeRating: '1', imageUrl: null, gameSystem,
  statBlock: { ac: 13, hpMax: 22, speed: '30 ft.', challengeRating: '1', abilities: { str: 14, dex: 12, con: 13, int: 6, wis: 10, cha: 6 } },
  size: { width: 1, height: 1 }, disposition: 'hostile', displayMode: 'pog', campaignId: 'campaign-1',
} as unknown as CreatureTemplate);

beforeEach(() => {
  vi.clearAllMocks();
  api.getSeedStatus.mockResolvedValue({ srdCount: 0 });
  api.listCreatureFavorites.mockResolvedValue({ favoriteIds: [], creatures: [] });
  api.updateCreature.mockImplementation((_c: string, id: string, payload: object) => Promise.resolve({ ...creature(null), id, ...payload }));
});

async function editAndSave(stored: CreatureTemplate) {
  api.listCreatures.mockResolvedValue({ creatures: [stored], total: 1 });
  render(<CreatureLibrary isOpen onClose={() => {}} />);
  await userEvent.click(await screen.findByText(stored.name));
  await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() => expect(api.updateCreature).toHaveBeenCalled());
  return api.updateCreature.mock.calls[0][2] as Record<string, unknown>;
}

it('sends no game system for a creature stored with one this build does not know', async () => {
  campaign.gameSystem = UNKNOWN;
  const payload = await editAndSave(creature(UNKNOWN));
  expect(payload).not.toHaveProperty('gameSystem');
  expect(payload.name).toBe('Marsh Lurker');
});

it("still sends the campaign's system for a creature of a supported one", async () => {
  campaign.gameSystem = 'FIFTH_EDITION';
  const payload = await editAndSave(creature('FIFTH_EDITION'));
  expect(payload.gameSystem).toBe('FIFTH_EDITION');
});
