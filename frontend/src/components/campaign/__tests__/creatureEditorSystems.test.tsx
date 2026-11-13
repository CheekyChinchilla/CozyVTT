/**
 * What the creature editors offer in each game system.
 *
 * 5E works a creature's saves and skills out from its ability scores and
 * Challenge Rating. Horror d100 has neither a rating nor a proficiency bonus,
 * yet both editors gave its creatures 5E's rating and derived saves and
 * skills. In that system the editors now offer the
 * scores under the names the stat block viewer shows and skills typed as
 * printed, and nothing is worked out from anything.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TokenDisposition } from '@/types';
import type { CreatureTemplate, GameSystem, NpcStatBlock } from '@/types';

const campaign = vi.hoisted(() => ({ id: 'campaign-1', gameSystem: 'FIFTH_EDITION' }));

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
  createCreature: vi.fn(),
  storedAssetSrc: (s: string) => s,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

import CreatureLibrary from '../CreatureLibrary';
import StatBlockEditor from '../npc-stat-blocks/StatBlockEditor';
import { STAT_BLOCK_LIMITS } from '@/constants/statBlockLimits';

const cultist: NpcStatBlock = {
  ac: 0, hpMax: 12, speed: '8', abilities: { str: 25, dex: 25, con: 25, int: 25, wis: 25, cha: 25 },
  skills: { 'Spot': 25 },
};

beforeEach(() => {
  campaign.gameSystem = 'FIFTH_EDITION';
  api.listCreatures.mockResolvedValue({ creatures: [], total: 0 });
  api.getSeedStatus.mockResolvedValue({ srdCount: 0 });
  api.listCreatureFavorites.mockResolvedValue({ favoriteIds: [], creatures: [] });
  api.listCampaigns.mockResolvedValue({ campaigns: [] });
  api.createCreature.mockReset();
  api.createCreature.mockImplementation((_c: string, payload: object) => Promise.resolve({ id: 'new', ...payload }));
});

describe('the token editor\'s stat block', () => {
  it('offers 5E its Challenge Rating', () => {
    render(<StatBlockEditor statBlock={cultist} onChange={vi.fn()} gameSystem="FIFTH_EDITION" />);
    expect(screen.getByLabelText('CR')).toBeTruthy();
  });

  it('offers a Horror d100 creature its characteristics and typed skills, and no rating', async () => {
    const onChange = vi.fn();
    render(<StatBlockEditor statBlock={cultist} onChange={onChange} gameSystem="HORROR_D100" />);

    expect(screen.queryByLabelText('CR')).toBeNull();
    // The open d100 rules' characteristics: POW in Wisdom's slot, CHA in Charisma's.
    expect(screen.getByText('POW')).toBeTruthy();
    expect(screen.getByText('CHA')).toBeTruthy();
    expect(screen.queryByText('APP')).toBeNull();
    expect(screen.queryByText('WIS')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /^Skills/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Spot' }), { target: { value: '40' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ skills: { 'Spot': 40 } }));
  });

  it('changes nothing else, bar naming the game system, when a Horror d100 score changes', async () => {
    const onChange = vi.fn();
    render(<StatBlockEditor statBlock={cultist} onChange={onChange} gameSystem="HORROR_D100" />);
    const str = screen.getByRole('spinbutton', { name: 'STR' });
    await userEvent.type(str, '0');
    expect(onChange).toHaveBeenLastCalledWith({ ...cultist, gameSystem: 'HORROR_D100', abilities: { ...cultist.abilities, str: 250 } });
  });
});

// A campaign stored with a system this build does not have, such as the
// value of one CozyVTT no longer supports, is played as one with none: its
// code is never written into a stat block, where it would later read as
// another system's label.
describe('a campaign of a system this build does not have', () => {
  it('leaves the token editor\'s stat block without its code', async () => {
    const onChange = vi.fn();
    render(<StatBlockEditor statBlock={cultist} onChange={onChange} gameSystem="SOMETHING_ELSE" />);
    await userEvent.type(screen.getByRole('spinbutton', { name: 'STR' }), '0');
    const edited = onChange.mock.lastCall?.[0];
    expect(edited).toMatchObject({ abilities: { ...cultist.abilities, str: 250 } });
    expect(edited).not.toHaveProperty('gameSystem');
  });

  it('shows the Creature Library unfiltered, asking for no system', async () => {
    campaign.gameSystem = 'SOMETHING_ELSE';
    api.listCreatures.mockClear();
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    await waitFor(() => expect(api.listCreatures).toHaveBeenCalled());
    expect(api.listCreatures.mock.lastCall?.[1]).toMatchObject({ gameSystem: undefined });
    expect(screen.queryByRole('combobox', { name: 'Game system filter' })).toBeNull();
  });
});

describe('the Creature Library\'s form', () => {
  it('offers a Horror d100 creature its characteristics and typed skills, and no rating', async () => {
    campaign.gameSystem = 'HORROR_D100';
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /Create Custom/ }));

    expect(screen.queryByLabelText('CR')).toBeNull();
    expect(screen.getByText('POW')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'New skill' })).toBeTruthy();
  });

  it('still offers 5E its Challenge Rating', async () => {
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /Create Custom/ }));
    expect(screen.getByLabelText('CR')).toBeTruthy();
  });
});

// A Horror d100 characteristic runs to three digits, and the boxes' padding
// cut off a score of 60. Each box keeps a narrow padding and no spinner, so
// its digits fit in a sixth of the narrowest editor.
describe('the score boxes', () => {
  const roomForFourDigits = (box: HTMLElement) => {
    expect(box.className.split(' ')).toEqual(expect.arrayContaining(['px-1', 'input-cozy-number', 'tabular-nums']));
  };
  const scores = ['STR', 'DEX', 'CON', 'INT', 'POW', 'CHA'];

  it('leave room for four digits in the token editor', () => {
    render(<StatBlockEditor statBlock={cultist} onChange={vi.fn()} gameSystem="HORROR_D100" />);
    for (const name of scores) roomForFourDigits(screen.getByRole('spinbutton', { name }));
  });

  it('leave room for four digits in the Creature Library\'s form', async () => {
    campaign.gameSystem = 'HORROR_D100';
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /Create Custom/ }));
    for (const name of scores) roomForFourDigits(screen.getByRole('spinbutton', { name }));
  });
});

describe('the Creature Library\'s list', () => {
  const row = (id: string, name: string, gameSystem: string, challengeRating: string): CreatureTemplate => ({
    id, name, gameSystem: gameSystem as GameSystem, source: 'custom', challengeRating, creatureType: null, alignment: null, imageUrl: null,
    statBlock: cultist, size: { width: 1, height: 1 }, disposition: TokenDisposition.HOSTILE, displayMode: 'pog', createdById: null, campaignId: 'campaign-1',
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
  });

  it('shows no rating on a Horror d100 creature that kept one from before, and still shows a 5E creature\'s', async () => {
    campaign.gameSystem = 'HORROR_D100';
    api.listCreatures.mockResolvedValue({ creatures: [row('cultist', 'Cultist', 'HORROR_D100', '1'), row('goblin', 'Goblin', 'FIFTH_EDITION', '1/4')], total: 2 });
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    expect(await screen.findByText('Cultist')).toBeTruthy();
    expect(screen.queryByText('CR 1')).toBeNull();
    expect(screen.getByText('CR 1/4')).toBeTruthy();
  });
});

// A Horror d100 creature's characteristics run past 5E's 30 and its
// skills past the 50 every other system shares. The stat block names its game
// system, which is what the server reads to choose the bounds.
describe('Horror d100 numbers', () => {
  it('lets the Creature Library\'s form save STR 60 and a skill of 55', async () => {
    campaign.gameSystem = 'HORROR_D100';
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /Create Custom/ }));
    await userEvent.type(screen.getByPlaceholderText('e.g. Hobgoblin'), 'Mire Lurker');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'STR' }), { target: { value: '60' } });
    await userEvent.type(screen.getByRole('textbox', { name: 'New skill' }), 'Lurk in Mud{Enter}');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Lurk in Mud' }), { target: { value: '55' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create Creature' }));

    await waitFor(() => expect(api.createCreature).toHaveBeenCalled());
    const statBlock = api.createCreature.mock.calls[0][1].statBlock;
    expect(statBlock.skills).toEqual({ 'Lurk in Mud': 55 });
    expect(statBlock.abilities.str).toBe(60);
    expect(statBlock.gameSystem).toBe('HORROR_D100');
  });

  it('offers the score boxes the bounds the server keeps, in each system', async () => {
    campaign.gameSystem = 'HORROR_D100';
    const { unmount } = render(<CreatureLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /Create Custom/ }));
    expect(screen.getByRole('spinbutton', { name: 'POW' }).getAttribute('max')).toBe(String(STAT_BLOCK_LIMITS.maxHorrorD100Characteristic));
    // The highest rating a character's sheet takes too.
    expect(STAT_BLOCK_LIMITS.maxHorrorD100Characteristic).toBe(999);
    unmount();

    campaign.gameSystem = 'FIFTH_EDITION';
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /Create Custom/ }));
    expect(screen.getByRole('spinbutton', { name: 'WIS' }).getAttribute('max')).toBe('30');
  });

  it('lets the token editor keep a skill of 55 and names the stat block\'s game system', async () => {
    const onChange = vi.fn();
    render(<StatBlockEditor statBlock={cultist} onChange={onChange} gameSystem="HORROR_D100" />);
    await userEvent.click(screen.getByRole('button', { name: /^Skills/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Spot' }), { target: { value: '55' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ gameSystem: 'HORROR_D100', skills: { 'Spot': 55 } })
    );
    expect(screen.getByRole('spinbutton', { name: 'STR' }).getAttribute('max')).toBe(String(STAT_BLOCK_LIMITS.maxHorrorD100Characteristic));
  });

  it('stops a skill at the Horror d100 bound', async () => {
    const onChange = vi.fn();
    render(<StatBlockEditor statBlock={cultist} onChange={onChange} gameSystem="HORROR_D100" />);
    await userEvent.click(screen.getByRole('button', { name: /^Skills/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Spot' }), { target: { value: '5000' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ skills: { 'Spot': STAT_BLOCK_LIMITS.maxHorrorD100Skill } }));
  });
});

// A score of 0 is legal. A box can be emptied and retyped; left empty, it
// keeps the score it had. A score past the bound stops at it when the box is
// left, so typing is never cut short on the way to a number.
describe('a typed score', () => {
  const ogre: NpcStatBlock = {
    ac: 11, hpMax: 30, speed: '40 ft.', abilities: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 },
  };

  it('keeps a 0 in the token editor', () => {
    const onChange = vi.fn();
    render(<StatBlockEditor statBlock={ogre} onChange={onChange} gameSystem="FIFTH_EDITION" />);
    const str = screen.getByRole('spinbutton', { name: 'STR' });
    fireEvent.change(str, { target: { value: '0' } });
    fireEvent.blur(str);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ abilities: { ...ogre.abilities, str: 0 } }));
  });

  it('keeps a Horror d100 POW of 0 in the token editor', () => {
    const onChange = vi.fn();
    render(<StatBlockEditor statBlock={cultist} onChange={onChange} gameSystem="HORROR_D100" />);
    const pow = screen.getByRole('spinbutton', { name: 'POW' });
    fireEvent.change(pow, { target: { value: '0' } });
    fireEvent.blur(pow);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ abilities: { ...cultist.abilities, wis: 0 } }));
  });

  it('lets the token editor\'s box be emptied, and keeps the score it had when it is left empty', () => {
    const onChange = vi.fn();
    render(<StatBlockEditor statBlock={ogre} onChange={onChange} gameSystem="FIFTH_EDITION" />);
    const str = screen.getByRole('spinbutton', { name: 'STR' }) as HTMLInputElement;
    fireEvent.change(str, { target: { value: '' } });
    expect(str.value).toBe('');
    fireEvent.blur(str);
    expect(str.value).toBe('19');
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    ['FIFTH_EDITION', '45', 30],
    ['HORROR_D100', '12000', STAT_BLOCK_LIMITS.maxHorrorD100Characteristic],
  ] as const)('stops at the bound in the token editor in %s when the box is left', (system, typed, bound) => {
    const onChange = vi.fn();
    render(<StatBlockEditor statBlock={system === 'FIFTH_EDITION' ? ogre : cultist} onChange={onChange} gameSystem={system} />);
    const str = screen.getByRole('spinbutton', { name: 'STR' }) as HTMLInputElement;
    fireEvent.change(str, { target: { value: typed } });
    expect(str.value).toBe(typed);
    fireEvent.blur(str);
    expect(str.value).toBe(String(bound));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ abilities: expect.objectContaining({ str: bound }) }));
  });

  async function openForm(system: string) {
    campaign.gameSystem = system;
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /Create Custom/ }));
    await userEvent.type(screen.getByPlaceholderText('e.g. Hobgoblin'), 'Mire Lurker');
  }

  async function savedAbilities(): Promise<NpcStatBlock['abilities']> {
    await userEvent.click(screen.getByRole('button', { name: 'Create Creature' }));
    await waitFor(() => expect(api.createCreature).toHaveBeenCalled());
    return api.createCreature.mock.calls[0][1].statBlock.abilities;
  }

  it('keeps a Horror d100 POW of 0 in the Creature Library\'s form', async () => {
    await openForm('HORROR_D100');
    const pow = screen.getByRole('spinbutton', { name: 'POW' });
    fireEvent.change(pow, { target: { value: '0' } });
    fireEvent.blur(pow);
    expect((await savedAbilities()).wis).toBe(0);
  });

  it('lets the Creature Library\'s box be emptied, and keeps the score it had when it is left empty', async () => {
    await openForm('FIFTH_EDITION');
    const str = screen.getByRole('spinbutton', { name: 'STR' }) as HTMLInputElement;
    fireEvent.change(str, { target: { value: '14' } });
    fireEvent.change(str, { target: { value: '' } });
    expect(str.value).toBe('');
    fireEvent.blur(str);
    expect(str.value).toBe('14');
    expect((await savedAbilities()).str).toBe(14);
  });

  it('stops at the bound in the Creature Library\'s form when the box is left', async () => {
    await openForm('FIFTH_EDITION');
    const str = screen.getByRole('spinbutton', { name: 'STR' }) as HTMLInputElement;
    fireEvent.change(str, { target: { value: '45' } });
    expect(str.value).toBe('45');
    fireEvent.blur(str);
    expect(str.value).toBe('30');
    expect((await savedAbilities()).str).toBe(30);
  });
});
