/**
 * Deleting a token template asks first.
 *
 * Delete sat in the expanded row and removed the template on one click, with
 * no undo. It now opens a confirmation naming the template.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  deleteTokenTemplate: vi.fn(),
  storedAssetSrc: (s: string) => s,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

const template: TokenTemplate = {
  id: 'template-1', name: 'Torch Prop', imageUrl: null, type: TokenType.OBJECT, disposition: TokenDisposition.NEUTRAL,
  displayMode: 'pog', size: { width: 1, height: 1 }, notes: null, hp: null, showHpBar: false, statBlock: null,
  sightRadius: null, campaignId: 'campaign-1', createdById: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  api.listTokenTemplates.mockResolvedValue({ templates: [template], total: 1, limit: 100, offset: 0 });
  api.listCampaigns.mockResolvedValue({ campaigns: [] });
  api.deleteTokenTemplate.mockResolvedValue({ message: 'ok' });
});

async function expandTemplate() {
  render(<TokenTemplateLibrary isOpen onClose={() => {}} />);
  await userEvent.click(await screen.findByText('Torch Prop'));
}

describe('deleting a token template', () => {
  it('asks first, naming the template, and Cancel keeps it', async () => {
    await expandTemplate();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Torch Prop' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete token template' });
    expect(dialog).toHaveTextContent('Torch Prop');
    expect(api.deleteTokenTemplate).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.deleteTokenTemplate).not.toHaveBeenCalled();
    expect(screen.getByText('Torch Prop')).toBeInTheDocument();
  });

  it('deletes it once confirmed', async () => {
    await expandTemplate();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Torch Prop' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete token template' })).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteTokenTemplate).toHaveBeenCalledWith('campaign-1', 'template-1'));
    await waitFor(() => expect(screen.queryByText('Torch Prop')).not.toBeInTheDocument());
  });
});
