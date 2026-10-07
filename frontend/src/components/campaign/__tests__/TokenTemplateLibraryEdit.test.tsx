/**
 * Editing a token template changes only what was edited.
 *
 * The form tied a template's hit points to its Show HP Bar box, which decides
 * only whether players see the bar. With the box off it sent `hp: null`, so
 * renaming a goblin whose bar was hidden deleted its hit points, and a
 * template of another type lost its stat block the same way.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TokenTemplate } from '@/types';
import { TokenType, TokenDisposition } from '@/types';
import TokenTemplateLibrary from '../TokenTemplateLibrary';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', gameSystem: 'DND_5E' }, currentMap: null }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const api = vi.hoisted(() => ({
  listTokenTemplates: vi.fn(),
  listCampaigns: vi.fn(),
  updateTokenTemplate: vi.fn(),
  createTokenTemplate: vi.fn(),
  storedAssetSrc: (s: string) => s,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

function template(overrides: Partial<TokenTemplate>): TokenTemplate {
  return {
    id: 'template-1', name: 'Goblin', imageUrl: null, type: TokenType.NPC, disposition: TokenDisposition.HOSTILE,
    displayMode: 'pog', size: { width: 1, height: 1 }, notes: null, hp: { current: 7, max: 7, temp: 0 },
    showHpBar: false, statBlock: null, sightRadius: null, campaignId: 'campaign-1', createdById: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function listReturns(t: TokenTemplate) {
  api.listTokenTemplates.mockResolvedValue({ templates: [t], total: 1, limit: 100, offset: 0 });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listCampaigns.mockResolvedValue({ campaigns: [] });
  api.updateTokenTemplate.mockImplementation(async (_c: string, id: string, data: Partial<TokenTemplate>) => ({ ...template({}), id, ...data }));
  api.createTokenTemplate.mockImplementation(async (_c: string, data: Partial<TokenTemplate>) => ({ ...template({}), id: 'new', ...data }));
});

async function openEditor(t: TokenTemplate) {
  listReturns(t);
  render(<TokenTemplateLibrary isOpen onClose={() => {}} />);
  await userEvent.click(await screen.findByText(t.name));
  await userEvent.click(screen.getByTitle('Edit template'));
}

async function rename(to: string) {
  const name = screen.getByPlaceholderText('e.g. Treasure Chest');
  await userEvent.clear(name);
  await userEvent.type(name, to);
}

/** What the last update sent. */
async function sentUpdate(): Promise<Record<string, unknown>> {
  await waitFor(() => expect(api.updateTokenTemplate).toHaveBeenCalled());
  return api.updateTokenTemplate.mock.calls[0][2] as Record<string, unknown>;
}

describe('editing a token template', () => {
  it('keeps the hit points of a template whose HP bar is hidden', async () => {
    await openEditor(template({}));
    await rename('Goblin Scout');
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const sent = await sentUpdate();
    expect(sent.name).toBe('Goblin Scout');
    expect(sent).not.toHaveProperty('hp');
    expect(sent).not.toHaveProperty('showHpBar');
  });

  it('does not heal a damaged template when something else is edited', async () => {
    await openEditor(template({ hp: { current: 3, max: 7, temp: 0 }, showHpBar: true }));
    await rename('Hurt Goblin');
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await sentUpdate()).not.toHaveProperty('hp');
  });

  it('shows the hit points whether or not the bar is shown, and saves a change to them', async () => {
    await openEditor(template({}));
    const max = screen.getByLabelText('Max HP') as HTMLInputElement;
    expect(max.value).toBe('7');

    await userEvent.clear(max);
    await userEvent.type(max, '11');
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    const sent = await sentUpdate();
    expect(sent.hp).toEqual({ current: 11, max: 11, temp: 0 });
    expect(sent).not.toHaveProperty('showHpBar');
  });

  it('keeps the stat block of a template that is not an NPC', async () => {
    await openEditor(template({ name: 'Statue', type: TokenType.OBJECT, statBlock: { ac: 15, speed: '0 ft.' } as unknown as TokenTemplate['statBlock'] }));
    await rename('Old Statue');
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await sentUpdate()).not.toHaveProperty('statBlock');
  });

  it('sends nothing when nothing was changed, and closes the form', async () => {
    await openEditor(template({}));
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save Changes' })).toBeNull());
    expect(api.updateTokenTemplate).not.toHaveBeenCalled();
  });

  it('removes the hit points only when the box is emptied', async () => {
    await openEditor(template({}));
    await userEvent.clear(screen.getByLabelText('Max HP'));
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect((await sentUpdate()).hp).toBeNull();
  });
});

describe('creating a token template', () => {
  it('records hit points with the HP bar hidden from players', async () => {
    listReturns(template({}));
    render(<TokenTemplateLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: /New Template/ }));

    await userEvent.type(screen.getByPlaceholderText('e.g. Treasure Chest'), 'Orc');
    await userEvent.type(screen.getByLabelText('Max HP'), '15');
    await userEvent.click(screen.getByRole('button', { name: 'Create Template' }));

    await waitFor(() => expect(api.createTokenTemplate).toHaveBeenCalled());
    const sent = api.createTokenTemplate.mock.calls[0][1] as Record<string, unknown>;
    expect(sent.hp).toEqual({ current: 15, max: 15, temp: 0 });
    expect(sent.showHpBar).toBe(false);
  });
});
