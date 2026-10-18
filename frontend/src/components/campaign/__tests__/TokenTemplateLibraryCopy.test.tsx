/**
 * Copying a token template to another campaign says what happened.
 *
 * A copy that worked only closed the menu, with nothing to say it had, and a
 * refused one showed "Failed to copy template" without the server's reason.
 * The menu could also be clicked again while the copy was on its way, making
 * a second copy. The library now names the campaign the template went to,
 * shows the server's reason for a refusal, and sends one copy at a time.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TokenTemplate } from '@/types';
import { TokenType, TokenDisposition, CampaignRole } from '@/types';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', gameSystem: 'DND_5E' }, currentMap: null }),
}));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const api = vi.hoisted(() => ({
  listTokenTemplates: vi.fn(),
  listCampaigns: vi.fn(),
  copyTokenTemplateToCampaign: vi.fn(),
  storedAssetSrc: (s: string) => s,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

import TokenTemplateLibrary from '../TokenTemplateLibrary';

const goblin: TokenTemplate = {
  id: 'template-1', name: 'Goblin', imageUrl: null, type: TokenType.NPC, disposition: TokenDisposition.HOSTILE,
  displayMode: 'pog', size: { width: 1, height: 1 }, notes: null, hp: null,
  showHpBar: false, statBlock: null, sightRadius: null, campaignId: 'campaign-1', createdById: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  api.listTokenTemplates.mockResolvedValue({ templates: [goblin], total: 1, limit: 100, offset: 0 });
  api.listCampaigns.mockResolvedValue({ campaigns: [{ id: 'campaign-2', name: 'Curse of the Crow', userRole: CampaignRole.DM }] });
  api.copyTokenTemplateToCampaign.mockResolvedValue({ ...goblin, id: 'copy-1', campaignId: 'campaign-2' });
});

async function openCopyMenu() {
  render(<TokenTemplateLibrary isOpen onClose={() => {}} />);
  await userEvent.click(await screen.findByText('Goblin'));
  await userEvent.click(screen.getByTitle('Copy to another campaign'));
  return screen.findByRole('button', { name: 'Curse of the Crow' });
}

it('names the campaign the template was copied to', async () => {
  await userEvent.click(await openCopyMenu());
  expect(await screen.findByText('Copied "Goblin" to Curse of the Crow.')).toBeInTheDocument();
  expect(api.copyTokenTemplateToCampaign).toHaveBeenCalledWith('campaign-1', 'template-1', 'campaign-2');
  expect(screen.queryByRole('button', { name: 'Curse of the Crow' })).not.toBeInTheDocument();
});

it('says why a copy was refused', async () => {
  api.copyTokenTemplateToCampaign.mockRejectedValue(Object.assign(new Error('Request failed'), {
    response: { status: 403, data: { error: 'Forbidden', message: 'You must be a DM in the target campaign to copy templates there' } },
  }));
  await userEvent.click(await openCopyMenu());
  expect(await screen.findByText('You must be a DM in the target campaign to copy templates there')).toBeInTheDocument();
});

it('sends one copy at a time', async () => {
  let finish: (value: TokenTemplate) => void = () => {};
  api.copyTokenTemplateToCampaign.mockReturnValue(new Promise<TokenTemplate>((resolve) => { finish = resolve; }));
  const target = await openCopyMenu();
  await userEvent.click(target);
  expect(target).toBeDisabled();
  await userEvent.click(target);
  expect(api.copyTokenTemplateToCampaign).toHaveBeenCalledTimes(1);

  finish({ ...goblin, id: 'copy-1', campaignId: 'campaign-2' });
  await waitFor(() => expect(screen.getByText('Copied "Goblin" to Curse of the Crow.')).toBeInTheDocument());
});
