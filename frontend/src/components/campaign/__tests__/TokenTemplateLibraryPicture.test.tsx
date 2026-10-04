/**
 * The Token Templates list shows each template's picture.
 *
 * A picture uploaded in the template editor is saved as the asset's bare id,
 * and the server stores it as sent. The list put that id straight into the
 * image's address, so the picture failed to load and the browser showed the
 * template's name in its place. Placing the template worked, because the
 * token route turns the id into an address, and the editor's own preview
 * already did. The list now does the same.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import api from '@/services/api';
import type { TokenTemplate } from '@/types';
import { TokenType, TokenDisposition } from '@/types';
import TokenTemplateLibrary from '../TokenTemplateLibrary';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', gameSystem: 'DND_5E' }, currentMap: null }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: null }),
}));
vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const ASSET_ID = '7b0e3c8e-1f2a-4d5b-9c6d-0e1f2a3b4c5d';

function template(overrides: Partial<TokenTemplate>): TokenTemplate {
  return {
    id: 'template-1',
    name: 'Goblin',
    imageUrl: null,
    type: TokenType.NPC,
    disposition: TokenDisposition.HOSTILE,
    displayMode: 'pog',
    size: { width: 1, height: 1 },
    notes: null,
    hp: null,
    showHpBar: false,
    statBlock: null,
    sightRadius: null,
    campaignId: 'campaign-1',
    createdById: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function listReturns(templates: TokenTemplate[]) {
  vi.spyOn(api, 'listTokenTemplates').mockResolvedValue({ templates, total: templates.length, limit: 100, offset: 0 });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, 'listCampaigns').mockResolvedValue({ campaigns: [] } as unknown as Awaited<ReturnType<typeof api.listCampaigns>>);
});

describe('the Token Templates list', () => {
  it('loads a picture stored as a bare asset id from the tokens route', async () => {
    listReturns([template({ name: 'Goblin', imageUrl: ASSET_ID })]);

    render(<TokenTemplateLibrary isOpen onClose={() => {}} />);

    const picture = await screen.findByRole('img', { name: 'Goblin' });
    expect(picture.getAttribute('src')).toBe(`/api/assets/tokens/${ASSET_ID}`);
  });

  it('uses a picture stored as an address as it is', async () => {
    listReturns([template({ name: 'Orc', imageUrl: `/api/assets/tokens/${ASSET_ID}` })]);

    render(<TokenTemplateLibrary isOpen onClose={() => {}} />);

    const picture = await screen.findByRole('img', { name: 'Orc' });
    expect(picture.getAttribute('src')).toBe(`/api/assets/tokens/${ASSET_ID}`);
  });
});
