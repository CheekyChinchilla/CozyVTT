/**
 * Deleting a custom creature asks first.
 *
 * Delete sat in the expanded row beside Duplicate and removed the creature from
 * the campaign on one click, with no undo. It now opens a confirmation naming
 * the creature. SRD creatures cannot be deleted and show no button.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreatureTemplate } from '@/types';
import CreatureLibrary from '../CreatureLibrary';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', gameSystem: null }, currentMap: null }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/components/assets/AssetPicker', () => ({ default: () => null }));

const api = vi.hoisted(() => ({
  listCreatures: vi.fn(),
  getSeedStatus: vi.fn(),
  listCreatureFavorites: vi.fn(),
  deleteCreature: vi.fn(),
}));
vi.mock('@/services/api', () => ({ api, default: api }));

const statBlock = { ac: 12, speed: '30 ft.', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } };

function creature(over: Partial<CreatureTemplate>): CreatureTemplate {
  return {
    id: 'c1', name: 'Boss Bat', source: 'custom', challengeRating: '1', imageUrl: null, statBlock,
    size: { width: 1, height: 1 }, disposition: 'hostile', displayMode: 'pog', campaignId: 'campaign-1',
    ...over,
  } as unknown as CreatureTemplate;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listCreatures.mockResolvedValue({ creatures: [creature({}), creature({ id: 'srd1', name: 'Goblin', source: 'srd' })], total: 2 });
  api.getSeedStatus.mockResolvedValue({ srdCount: 1 });
  api.listCreatureFavorites.mockResolvedValue({ favoriteIds: [], creatures: [] });
  api.deleteCreature.mockResolvedValue({ message: 'ok' });
});

async function expandBat() {
  const loadsBefore = api.listCreatures.mock.calls.length;
  render(<CreatureLibrary isOpen onClose={() => {}} />);
  // Opening loads the list, and the search box's 300 ms debounce loads it again.
  // Wait for both, so that second load cannot return the creature after a delete.
  await waitFor(() => expect(api.listCreatures.mock.calls.length).toBeGreaterThanOrEqual(loadsBefore + 2));
  await userEvent.click(await screen.findByText('Boss Bat'));
}

describe('deleting a custom creature', () => {
  it('asks first, naming the creature, and Cancel keeps it', async () => {
    await expandBat();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Boss Bat' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete creature' });
    expect(dialog).toHaveTextContent('Boss Bat');
    expect(api.deleteCreature).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.deleteCreature).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete Boss Bat' })).toBeInTheDocument();
  });

  it('deletes it once confirmed', async () => {
    await expandBat();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Boss Bat' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete creature' })).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteCreature).toHaveBeenCalledWith('campaign-1', 'c1'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete Boss Bat' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText('Boss Bat')).not.toBeInTheDocument());
  });

  it('offers no delete for an SRD creature', async () => {
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByText('Goblin'));
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
  });
});
