/**
 * Importing the SRD creatures is offered to administrators only.
 *
 * The import fills the library every campaign on the server shares, so the
 * server now lets only an administrator run it. A DM who is not one is told
 * to ask one, instead of being offered a button the server refuses, and a
 * refused or failed import shows the server's reason.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  seedSrdCreatures: vi.fn(),
}));
vi.mock('@/services/api', () => ({ api, default: api }));

beforeEach(() => {
  vi.clearAllMocks();
  api.listCreatures.mockResolvedValue({ creatures: [], total: 0 });
  api.listCreatureFavorites.mockResolvedValue({ favoriteIds: [], creatures: [] });
});

describe('the SRD import in an empty library', () => {
  it('tells a DM who is not an administrator to ask one, with no button', async () => {
    api.getSeedStatus.mockResolvedValue({ srdCount: 0, customCount: 0, seedInProgress: false, canSeed: false });
    render(<CreatureLibrary isOpen onClose={() => {}} />);

    expect(await screen.findByText(/Ask an administrator to import them/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import D&D 5e SRD Creatures' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import D&D 5e SRD$/ })).not.toBeInTheDocument();
  });

  it('offers an administrator the import, and shows the server\'s reason when it fails', async () => {
    api.getSeedStatus.mockResolvedValue({ srdCount: 0, customCount: 0, seedInProgress: false, canSeed: true });
    api.seedSrdCreatures.mockRejectedValue({
      response: { status: 502, data: { error: 'Bad Gateway', message: 'api.open5e.com did not answer within 15 seconds.' } },
    });
    render(<CreatureLibrary isOpen onClose={() => {}} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Import D&D 5e SRD Creatures' }));

    expect(await screen.findByText('api.open5e.com did not answer within 15 seconds.')).toBeInTheDocument();
  });

  it('keeps the server\'s reason on screen when the list reloads after it', async () => {
    // The library loads its list again 300 ms after it opens (the search
    // box's debounce), and a list load cleared the one error box, so a failure
    // shown in that time vanished.
    api.getSeedStatus.mockResolvedValue({ srdCount: 0, customCount: 0, seedInProgress: false, canSeed: true });
    api.seedSrdCreatures.mockRejectedValue({
      response: { status: 502, data: { error: 'Bad Gateway', message: 'api.open5e.com did not answer within 15 seconds.' } },
    });
    render(<CreatureLibrary isOpen onClose={() => {}} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Import D&D 5e SRD Creatures' }));
    expect(await screen.findByText('api.open5e.com did not answer within 15 seconds.')).toBeInTheDocument();

    await waitFor(() => expect(api.listCreatures.mock.calls.length).toBeGreaterThan(1), { timeout: 2000 });
    expect(screen.getByText('api.open5e.com did not answer within 15 seconds.')).toBeInTheDocument();
  });
});
