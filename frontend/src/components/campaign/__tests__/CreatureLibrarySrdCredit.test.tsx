/**
 * The SRD 5.1 credit, which its CC BY 4.0 licence asks for wherever the
 * material is shown.
 *
 * The library credited the SRD only beside the import button, which an
 * administrator sees only before the import, so once the creatures were in
 * nothing on screen said where they came from. The credit now shows at the
 * foot of the library whenever it lists an SRD creature.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CreatureLibrary from '../CreatureLibrary';
import type { CreatureTemplate } from '@/types';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', gameSystem: null }, currentMap: null }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/components/assets/AssetPicker', () => ({ default: () => null }));

const api = vi.hoisted(() => ({
  listCreatures: vi.fn(),
  getSeedStatus: vi.fn(),
  listCreatureFavorites: vi.fn(),
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

const CREDIT = /System Reference Document 5\.1/;

beforeEach(() => {
  vi.clearAllMocks();
  api.listCreatureFavorites.mockResolvedValue({ favoriteIds: [], creatures: [] });
});

describe('the SRD credit in the Creature Library', () => {
  it('shows while the library lists an SRD creature, with links to the SRD and its licence', async () => {
    api.listCreatures.mockResolvedValue({ creatures: [creature({}), creature({ id: 'srd1', name: 'Goblin', source: 'srd' })], total: 2 });
    api.getSeedStatus.mockResolvedValue({ srdCount: 320, customCount: 1, seedInProgress: false, canSeed: false });
    render(<CreatureLibrary isOpen onClose={() => {}} />);

    expect(await screen.findByText('Goblin')).toBeInTheDocument();
    const credit = screen.getByText(CREDIT);
    expect(credit).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'System Reference Document 5.1' }))
      .toHaveAttribute('href', 'https://dnd.wizards.com/resources/systems-reference-document');
    expect(screen.getByRole('link', { name: 'CC BY 4.0' }))
      .toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/legalcode');
  });

  it('is not shown while the library lists only custom creatures', async () => {
    api.listCreatures.mockResolvedValue({ creatures: [creature({})], total: 1 });
    api.getSeedStatus.mockResolvedValue({ srdCount: 320, customCount: 1, seedInProgress: false, canSeed: false });
    render(<CreatureLibrary isOpen onClose={() => {}} />);

    expect(await screen.findByText('Boss Bat')).toBeInTheDocument();
    expect(screen.queryByText(CREDIT)).not.toBeInTheDocument();
  });

  it('shows beside the import an administrator is offered', async () => {
    api.listCreatures.mockResolvedValue({ creatures: [], total: 0 });
    api.getSeedStatus.mockResolvedValue({ srdCount: 0, customCount: 0, seedInProgress: false, canSeed: true });
    render(<CreatureLibrary isOpen onClose={() => {}} />);

    expect(await screen.findByRole('button', { name: 'Import D&D 5e SRD Creatures' })).toBeInTheDocument();
    expect(screen.getByText(CREDIT)).toBeInTheDocument();
  });
});
