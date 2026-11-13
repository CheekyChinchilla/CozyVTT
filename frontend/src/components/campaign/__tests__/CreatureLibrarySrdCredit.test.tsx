/**
 * The SRD 5.1 credit, which its CC BY 4.0 licence asks for wherever the
 * material is shown.
 *
 * The credit shows beside the import button, which an administrator sees
 * before the import, and at the foot of the library whenever it may list an
 * SRD creature. It is the sentence the SRD asks for, word for word.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreatureLibrary from '../CreatureLibrary';
import type { CreatureTemplate } from '@/types';
import { SRD_ATTRIBUTION, SRD_MODIFIED } from '@/constants/gameContentNotices';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', gameSystem: null }, currentMap: null, viewedMap: null }),
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
    expect(screen.getByText(CREDIT).textContent).toBe(SRD_ATTRIBUTION);
    const addresses = SRD_ATTRIBUTION.split(/\s+/)
      .filter((word) => word.startsWith('https://'))
      .map((word) => word.replace(/[.,]+$/, ''));
    expect(addresses).toHaveLength(2);
    for (const address of addresses) {
      expect(screen.getByRole('link', { name: address })).toHaveAttribute('href', address);
    }
  });

  // A copy of an SRD creature is custom, and nothing on it says where it
  // came from, so on an instance holding SRD creatures any custom one may be one.
  it('shows while the library lists custom creatures on an instance that holds SRD creatures', async () => {
    api.listCreatures.mockResolvedValue({ creatures: [creature({ name: 'Goblin (Custom)' })], total: 1 });
    api.getSeedStatus.mockResolvedValue({ srdCount: 320, customCount: 1, seedInProgress: false, canSeed: false });
    render(<CreatureLibrary isOpen onClose={() => {}} />);

    expect(await screen.findByText('Goblin (Custom)')).toBeInTheDocument();
    expect(screen.getByText(CREDIT).textContent).toBe(SRD_ATTRIBUTION);
  });

  it('is not shown while the instance holds no SRD creature and the library lists only custom ones', async () => {
    api.listCreatures.mockResolvedValue({ creatures: [creature({})], total: 1 });
    api.getSeedStatus.mockResolvedValue({ srdCount: 0, customCount: 1, seedInProgress: false, canSeed: false });
    render(<CreatureLibrary isOpen onClose={() => {}} />);

    expect(await screen.findByText('Boss Bat')).toBeInTheDocument();
    expect(screen.queryByText(CREDIT)).not.toBeInTheDocument();
  });

  // Favourites are listed whatever the campaign's system, so in a campaign of
  // another system an SRD creature may be shown there alone.
  it('shows while an SRD creature is listed under Favorites only', async () => {
    api.listCreatures.mockResolvedValue({ creatures: [], total: 0 });
    api.listCreatureFavorites.mockResolvedValue({
      favoriteIds: ['srd1'], creatures: [creature({ id: 'srd1', name: 'Aboleth', source: 'srd' })],
    });
    api.getSeedStatus.mockResolvedValue({ srdCount: 320, customCount: 0, seedInProgress: false, canSeed: false });
    render(<CreatureLibrary isOpen onClose={() => {}} />);

    expect(await screen.findByText('Aboleth')).toBeInTheDocument();
    expect(screen.getByText(CREDIT).textContent).toBe(SRD_ATTRIBUTION);
  });

  // The SRD asks that a work say when it changed the material.
  it('says CozyVTT reformatted and reworded the material, at a size and colour that can be read', async () => {
    api.listCreatures.mockResolvedValue({ creatures: [creature({ id: 'srd1', name: 'Goblin', source: 'srd' })], total: 1 });
    api.getSeedStatus.mockResolvedValue({ srdCount: 320, customCount: 0, seedInProgress: false, canSeed: false });
    render(<CreatureLibrary isOpen onClose={() => {}} />);

    expect(await screen.findByText('Goblin')).toBeInTheDocument();
    for (const line of [screen.getByText(CREDIT), screen.getByText(SRD_MODIFIED)]) {
      expect(line).toHaveClass('text-xs', 'text-ink-muted');
      expect(line.className).not.toMatch(/text-\[\d+px\]|\/\d+\b/);
    }
  });

  it('names the SRD source filter SRD 5.1, and never as official', async () => {
    api.listCreatures.mockResolvedValue({ creatures: [], total: 0 });
    api.getSeedStatus.mockResolvedValue({ srdCount: 320, customCount: 0, seedInProgress: false, canSeed: false });
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Filters' }));

    expect(await screen.findByRole('option', { name: 'SRD 5.1' })).toHaveValue('srd');
    expect(screen.queryByRole('option', { name: /Official/ })).not.toBeInTheDocument();
  });

  it('shows beside the import an administrator is offered', async () => {
    api.listCreatures.mockResolvedValue({ creatures: [], total: 0 });
    api.getSeedStatus.mockResolvedValue({ srdCount: 0, customCount: 0, seedInProgress: false, canSeed: true });
    render(<CreatureLibrary isOpen onClose={() => {}} />);

    expect(await screen.findByRole('button', { name: 'Import 5E SRD Creatures' })).toBeInTheDocument();
    expect(screen.getByText(CREDIT).textContent).toBe(SRD_ATTRIBUTION);
  });
});
