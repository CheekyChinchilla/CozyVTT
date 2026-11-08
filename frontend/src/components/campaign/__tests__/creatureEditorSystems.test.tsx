/**
 * What the creature editors offer in each game system.
 *
 * D&D 5e works a creature's saves and skills out from its ability scores and
 * Challenge Rating. Call of Cthulhu and Shadowrun 6e have neither a rating nor
 * a proficiency bonus, yet both editors gave their creatures D&D 5e's rating
 * and derived saves and skills. In those systems the editors now offer the
 * scores under the names the stat block viewer shows and skills typed as
 * printed, and nothing is worked out from anything.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NpcStatBlock } from '@/types';

const campaign = vi.hoisted(() => ({ id: 'campaign-1', gameSystem: 'DND_5E' }));

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign, currentMap: null, viewedMap: null }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/components/assets/AssetPicker', () => ({ default: () => null }));

const api = vi.hoisted(() => ({
  listCreatures: vi.fn(),
  getSeedStatus: vi.fn(),
  listCreatureFavorites: vi.fn(),
  listCampaigns: vi.fn(),
  storedAssetSrc: (s: string) => s,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

import CreatureLibrary from '../CreatureLibrary';
import StatBlockEditor from '../npc-stat-blocks/StatBlockEditor';

const cultist: NpcStatBlock = {
  ac: 0, hpMax: 12, speed: '8', abilities: { str: 25, dex: 25, con: 25, int: 25, wis: 25, cha: 25 },
  skills: { 'Spot Hidden': 25 },
};

beforeEach(() => {
  campaign.gameSystem = 'DND_5E';
  api.listCreatures.mockResolvedValue({ creatures: [], total: 0 });
  api.getSeedStatus.mockResolvedValue({ srdCount: 0 });
  api.listCreatureFavorites.mockResolvedValue({ favoriteIds: [], creatures: [] });
  api.listCampaigns.mockResolvedValue({ campaigns: [] });
});

describe('the token editor\'s stat block', () => {
  it('offers D&D 5e its Challenge Rating', () => {
    render(<StatBlockEditor statBlock={cultist} onChange={vi.fn()} gameSystem="DND_5E" />);
    expect(screen.getByLabelText('CR')).toBeTruthy();
  });

  it('offers a Call of Cthulhu creature its characteristics and typed skills, and no rating', async () => {
    const onChange = vi.fn();
    render(<StatBlockEditor statBlock={cultist} onChange={onChange} gameSystem="CALL_OF_CTHULHU_7E" />);

    expect(screen.queryByLabelText('CR')).toBeNull();
    expect(screen.getByText('POW')).toBeTruthy();
    expect(screen.getByText('APP')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /^Skills/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Spot Hidden' }), { target: { value: '40' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ skills: { 'Spot Hidden': 40 } }));
  });

  it('changes nothing else when a Call of Cthulhu score changes', async () => {
    const onChange = vi.fn();
    render(<StatBlockEditor statBlock={cultist} onChange={onChange} gameSystem="CALL_OF_CTHULHU_7E" />);
    const str = screen.getByRole('spinbutton', { name: 'STR' });
    await userEvent.type(str, '0');
    expect(onChange).toHaveBeenLastCalledWith({ ...cultist, abilities: { ...cultist.abilities, str: 250 } });
  });
});

describe('the Creature Library\'s form', () => {
  it('offers a Call of Cthulhu creature its characteristics and typed skills, and no rating', async () => {
    campaign.gameSystem = 'CALL_OF_CTHULHU_7E';
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /Create Custom/ }));

    expect(screen.queryByLabelText('CR')).toBeNull();
    expect(screen.getByText('POW')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'New skill' })).toBeTruthy();
  });

  it('still offers D&D 5e its Challenge Rating', async () => {
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /Create Custom/ }));
    expect(screen.getByLabelText('CR')).toBeTruthy();
  });
});
