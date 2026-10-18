/**
 * The Creature Library and Token Templates say why the server refused, and
 * their boxes stop where the server's limits are.
 *
 * Every refusal showed a fixed sentence, such as "Failed to create creature",
 * so a stat block over 64 KB, or one field over its limit, gave the DM nothing
 * to go on. No text box had a limit, so the form took what the server would
 * refuse. The forms now show the server's reason, and each box stops at the
 * limit the server applies (STAT_BLOCK_LIMITS, kept identical in both
 * packages).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreatureTemplate, NpcStatBlock, TokenTemplate } from '@/types';
import { TokenType, TokenDisposition } from '@/types';
import { STAT_BLOCK_LIMITS } from '@/constants/statBlockLimits';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', gameSystem: 'DND_5E' }, currentMap: null }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/components/assets/AssetPicker', () => ({ default: () => null }));

const api = vi.hoisted(() => ({
  listCreatures: vi.fn(),
  getSeedStatus: vi.fn(),
  listCreatureFavorites: vi.fn(),
  createCreature: vi.fn(),
  updateCreature: vi.fn(),
  duplicateCreature: vi.fn(),
  deleteCreature: vi.fn(),
  listTokenTemplates: vi.fn(),
  listCampaigns: vi.fn(),
  createTokenTemplate: vi.fn(),
  updateTokenTemplate: vi.fn(),
  deleteTokenTemplate: vi.fn(),
  uploadAsset: vi.fn(),
  storedAssetSrc: (s: string) => s,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

import CreatureLibrary from '../CreatureLibrary';
import TokenTemplateLibrary from '../TokenTemplateLibrary';
import StatBlockEditor from '../npc-stat-blocks/StatBlockEditor';

const statBlock: NpcStatBlock = { ac: 12, hpMax: 7, speed: '30 ft.', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } };

const bat = {
  id: 'c1', name: 'Boss Bat', source: 'custom', challengeRating: '1', imageUrl: null, gameSystem: 'DND_5E', statBlock,
  size: { width: 1, height: 1 }, disposition: 'hostile', displayMode: 'pog', campaignId: 'campaign-1',
} as unknown as CreatureTemplate;

const goblin: TokenTemplate = {
  id: 'template-1', name: 'Goblin', imageUrl: null, type: TokenType.NPC, disposition: TokenDisposition.HOSTILE,
  displayMode: 'pog', size: { width: 1, height: 1 }, notes: null, hp: { current: 7, max: 7, temp: 0 },
  showHpBar: false, statBlock: null, sightRadius: null, campaignId: 'campaign-1', createdById: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

/** What the API client throws for a refusal carrying `message`. */
const refusal = (message: string) => Object.assign(new Error('Request failed'), { response: { status: 400, data: { error: 'Validation Error', message } } });
const TOO_LARGE = 'statBlock: Stat block is too large (64 KB maximum)';

beforeEach(() => {
  vi.clearAllMocks();
  api.listCreatures.mockResolvedValue({ creatures: [bat], total: 1 });
  api.getSeedStatus.mockResolvedValue({ srdCount: 0 });
  api.listCreatureFavorites.mockResolvedValue({ favoriteIds: [], creatures: [] });
  api.listTokenTemplates.mockResolvedValue({ templates: [goblin], total: 1, limit: 100, offset: 0 });
  api.listCampaigns.mockResolvedValue({ campaigns: [] });
});

const maxLength = (element: HTMLElement) => (element as HTMLInputElement).maxLength;

describe('the Creature Library', () => {
  async function openBat() {
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByText('Boss Bat'));
  }

  it('says why a new creature was refused', async () => {
    api.createCreature.mockRejectedValue(refusal(TOO_LARGE));
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /Create Custom/ }));
    await userEvent.type(screen.getByPlaceholderText('e.g. Goblin Boss'), 'Goblin Boss');
    await userEvent.click(screen.getByRole('button', { name: 'Create Creature' }));
    expect(await screen.findByText(TOO_LARGE)).toBeTruthy();
  });

  it('says why a change was refused', async () => {
    api.updateCreature.mockRejectedValue(refusal(TOO_LARGE));
    await openBat();
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByText(TOO_LARGE)).toBeTruthy();
  });

  it('says why a duplicate was refused', async () => {
    api.duplicateCreature.mockRejectedValue(refusal('The campaign has too many creatures'));
    await openBat();
    await userEvent.click(screen.getByRole('button', { name: /Duplicate/ }));
    expect(await screen.findByText('The campaign has too many creatures')).toBeTruthy();
  });

  it('says why a delete was refused', async () => {
    api.deleteCreature.mockRejectedValue(refusal('Creature belongs to another campaign'));
    await openBat();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Boss Bat' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete creature' })).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Creature belongs to another campaign')).toBeTruthy();
  });

  it('stops each text box at the server\'s limit', async () => {
    await openBat();
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
    expect(maxLength(screen.getByPlaceholderText('e.g. Goblin Boss'))).toBe(STAT_BLOCK_LIMITS.maxNameLength);
    expect(maxLength(screen.getByPlaceholderText('Small humanoid'))).toBe(STAT_BLOCK_LIMITS.maxCreatureTypeLength);
    expect(maxLength(screen.getByPlaceholderText('neutral evil'))).toBe(STAT_BLOCK_LIMITS.maxAlignmentLength);
    expect(maxLength(screen.getByDisplayValue('30 ft.'))).toBe(STAT_BLOCK_LIMITS.maxSpeedLength);

    await userEvent.click(screen.getByRole('button', { name: 'Advanced Stats' }));
    for (const placeholder of ['fire', 'cold, bludgeoning', 'poison', 'charmed, frightened', 'darkvision 60 ft.', 'Common, Goblin']) {
      expect(maxLength(screen.getByPlaceholderText(placeholder))).toBe(STAT_BLOCK_LIMITS.maxDetailLength);
    }
    const traits = screen.getByText('Traits', { selector: 'label' }).parentElement!.parentElement!;
    await userEvent.click(within(traits).getByRole('button', { name: /Add/ }));
    expect(maxLength(within(traits).getByPlaceholderText('Name'))).toBe(STAT_BLOCK_LIMITS.maxEntryNameLength);
    expect(maxLength(within(traits).getByPlaceholderText('Description'))).toBe(STAT_BLOCK_LIMITS.maxEntryDescriptionLength);
  });

  it('stops adding traits at the most a list may hold', async () => {
    api.listCreatures.mockResolvedValue({
      creatures: [{ ...bat, statBlock: { ...statBlock, traits: Array.from({ length: STAT_BLOCK_LIMITS.maxListEntries }, (_, i) => ({ name: `Trait ${i}`, description: '' })) } }],
      total: 1,
    });
    await openBat();
    await userEvent.click(screen.getByRole('button', { name: /Edit/ }));
    const traits = screen.getByText('Traits', { selector: 'label' }).parentElement!.parentElement!;
    expect((within(traits).getByRole('button', { name: /Add/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('the Token Templates', () => {
  async function openGoblin() {
    render(<TokenTemplateLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByText('Goblin'));
  }

  it('says why a new template was refused', async () => {
    api.createTokenTemplate.mockRejectedValue(refusal(TOO_LARGE));
    render(<TokenTemplateLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /New Template/ }));
    await userEvent.type(screen.getByPlaceholderText('e.g. Treasure Chest'), 'Chest');
    await userEvent.click(screen.getByRole('button', { name: 'Create Template' }));
    expect(await screen.findByText(TOO_LARGE)).toBeTruthy();
  });

  it('says why a change was refused', async () => {
    api.updateTokenTemplate.mockRejectedValue(refusal(TOO_LARGE));
    await openGoblin();
    await userEvent.click(screen.getByTitle('Edit template'));
    await userEvent.type(screen.getByPlaceholderText('e.g. Treasure Chest'), ' Boss');
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByText(TOO_LARGE)).toBeTruthy();
  });

  it('says why a delete was refused', async () => {
    api.deleteTokenTemplate.mockRejectedValue(refusal('Token template belongs to another campaign'));
    await openGoblin();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Goblin' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete token template' })).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Token template belongs to another campaign')).toBeTruthy();
  });

  it('says why a picture was refused', async () => {
    api.uploadAsset.mockRejectedValue(refusal('That file is not a PNG, JPEG, WebP or GIF picture'));
    await openGoblin();
    await userEvent.click(screen.getByTitle('Edit template'));
    const picker = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(picker, new File(['x'], 'goblin.png', { type: 'image/png' }));
    expect(await screen.findByText('That file is not a PNG, JPEG, WebP or GIF picture')).toBeTruthy();
  });

  it('stops the name and notes at the server\'s limit', async () => {
    await openGoblin();
    await userEvent.click(screen.getByTitle('Edit template'));
    expect(maxLength(screen.getByPlaceholderText('e.g. Treasure Chest'))).toBe(STAT_BLOCK_LIMITS.maxNameLength);
    expect(maxLength(screen.getByPlaceholderText('Optional description or notes'))).toBe(STAT_BLOCK_LIMITS.maxNotesLength);
  });
});

describe('the stat block editor', () => {
  const full: NpcStatBlock = { ...statBlock, traits: [{ name: 'Keen Hearing', description: '' }] };

  it('stops each text box at the server\'s limit', async () => {
    render(<StatBlockEditor statBlock={full} onChange={() => {}} gameSystem={null} />);
    expect(maxLength(screen.getByPlaceholderText('Medium humanoid'))).toBe(STAT_BLOCK_LIMITS.maxCreatureTypeLength);
    expect(maxLength(screen.getByPlaceholderText('neutral evil'))).toBe(STAT_BLOCK_LIMITS.maxAlignmentLength);
    expect(maxLength(screen.getByPlaceholderText('30 ft., fly 60 ft.'))).toBe(STAT_BLOCK_LIMITS.maxSpeedLength);

    await userEvent.click(screen.getByRole('button', { name: 'Defenses & Senses' }));
    for (const label of ['Damage Vulnerabilities', 'Damage Resistances', 'Damage Immunities', 'Condition Immunities', 'Senses', 'Languages']) {
      expect(maxLength(screen.getByText(label, { selector: 'label' }).parentElement!.querySelector('input')!)).toBe(STAT_BLOCK_LIMITS.maxDetailLength);
    }
    await userEvent.click(screen.getByRole('button', { name: 'Traits' }));
    expect(maxLength(screen.getByPlaceholderText('Ability name'))).toBe(STAT_BLOCK_LIMITS.maxEntryNameLength);
    expect(maxLength(screen.getByPlaceholderText('Description...'))).toBe(STAT_BLOCK_LIMITS.maxEntryDescriptionLength);
    await userEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(maxLength(screen.getByPlaceholderText('Additional notes...'))).toBe(STAT_BLOCK_LIMITS.maxNotesLength);
  });

  it('stops adding entries at the most a list may hold', async () => {
    const traits = Array.from({ length: STAT_BLOCK_LIMITS.maxListEntries }, (_, i) => ({ name: `Trait ${i}`, description: '' }));
    render(<StatBlockEditor statBlock={{ ...statBlock, traits }} onChange={() => {}} gameSystem={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Traits' }));
    expect((screen.getByRole('button', { name: /Add entry/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
