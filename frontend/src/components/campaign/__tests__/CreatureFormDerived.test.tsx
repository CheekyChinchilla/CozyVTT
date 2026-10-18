/**
 * The creature form saves the saves and skills its numbers give.
 *
 * - D&D 5e: changing an ability score or the challenge rating left the saved
 *   saves and skills as they were, while the form showed the new ones, so a
 *   Goblin given Dexterity 16 kept Stealth +6 and rolled it.
 * - Pathfinder 2e: the form edited D&D ability scores, while a Pathfinder
 *   stat block holds attribute modifiers, which the token editor writes and
 *   every roll and viewer reads. It now edits the modifiers.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreatureTemplate } from '@/types';

const campaign = vi.hoisted(() => ({ gameSystem: 'DND_5E' as string | null }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', gameSystem: campaign.gameSystem }, currentMap: null }),
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

const goblin = {
  id: 'c1', name: 'Sneaky Goblin', source: 'custom', challengeRating: '1/4', imageUrl: null, gameSystem: 'DND_5E',
  statBlock: { ac: 15, hpMax: 7, speed: '30 ft.', challengeRating: '1/4', abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }, skills: { stealth: 6 } },
  size: { width: 1, height: 1 }, disposition: 'hostile', displayMode: 'pog', campaignId: 'campaign-1',
} as unknown as CreatureTemplate;

const ogre = {
  ...goblin, id: 'c2', name: 'Ogre Brute', gameSystem: 'PATHFINDER_2E', challengeRating: null,
  statBlock: { ac: 17, hpMax: 50, speed: '25 feet', level: 3, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, attributeModifiers: { str: 4, dex: -1, con: 3, int: -2, wis: 0, cha: -2 } },
} as unknown as CreatureTemplate;

beforeEach(() => {
  vi.clearAllMocks();
  api.getSeedStatus.mockResolvedValue({ srdCount: 0 });
  api.listCreatureFavorites.mockResolvedValue({ favoriteIds: [], creatures: [] });
  api.updateCreature.mockImplementation((_c: string, id: string, payload: object) => Promise.resolve({ ...goblin, id, ...payload }));
});

async function edit(creature: CreatureTemplate) {
  api.listCreatures.mockResolvedValue({ creatures: [creature], total: 1 });
  render(<CreatureLibrary isOpen onClose={() => {}} />);
  await userEvent.click(await screen.findByText(creature.name));
  await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
}

/** The number box under one of the six column labels. */
const box = (label: string) => screen.getByText(label, { selector: 'label' }).parentElement!.querySelector('input')!;

const saved = () => api.updateCreature.mock.calls[0][2].statBlock;

it('saves the Stealth a higher Dexterity gives', async () => {
  campaign.gameSystem = 'DND_5E';
  await edit(goblin);
  fireEvent.change(box('DEX'), { target: { value: '16' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

  await waitFor(() => expect(api.updateCreature).toHaveBeenCalled());
  expect(saved().skills.stealth).toBe(7);
});

it('saves the Stealth a higher challenge rating gives', async () => {
  campaign.gameSystem = 'DND_5E';
  await edit(goblin);
  fireEvent.change(screen.getByLabelText('CR'), { target: { value: '5' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

  await waitFor(() => expect(api.updateCreature).toHaveBeenCalled());
  expect(saved().skills.stealth).toBe(8);
});

it('edits a Pathfinder creature\'s attribute modifiers', async () => {
  campaign.gameSystem = 'PATHFINDER_2E';
  await edit(ogre);
  expect(screen.getByText('Attribute Modifiers')).toBeTruthy();
  expect(box('Str').value).toBe('4');

  fireEvent.change(box('Str'), { target: { value: '5' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

  await waitFor(() => expect(api.updateCreature).toHaveBeenCalled());
  expect(saved().attributeModifiers).toEqual({ str: 5, dex: -1, con: 3, int: -2, wis: 0, cha: -2 });
});
