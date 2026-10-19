/**
 * Where a picture uploaded from Create Map goes.
 *
 * It went to the campaign's library, where every member, spectators
 * included, can browse it, so a map prepared days ahead could be seen in the
 * Asset Library before the DM switched to it. Upload New now asks: Personal,
 * selected at first, which players see only once the map using it is on
 * screen, or the campaign's library, which keeps it for the table if the DM
 * leaves. Each choice says so in a line of its own.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/services/api', () => {
  const client = { getAssetUrl: (id: string) => `/api/assets/maps/${id}`, getAssetThumbnailUrl: (id: string) => `/api/assets/maps/${id}/thumbnail`, listAssets: vi.fn().mockResolvedValue({ assets: [], pagination: {} }) };
  return { api: client, default: client };
});
vi.mock('@/services/map.service', () => ({ default: { createMap: vi.fn() } }));
vi.mock('@/utils/detectMapGrid', () => ({ detectMapGrid: vi.fn().mockResolvedValue(null) }));
vi.mock('@/components/assets/AssetUploadModal', () => ({
  default: ({ defaultScope, defaultCampaignId, campaignOption }: { defaultScope?: string; defaultCampaignId?: string; campaignOption?: string }) => (
    <span data-testid="upload-target">{`${defaultScope ?? 'scope not locked'}|${defaultCampaignId ?? 'campaign not locked'}|${campaignOption ?? 'no campaign offered'}`}</span>
  ),
}));

import CreateMapModal from '../CreateMapModal';

beforeAll(() => {
  // The preview draws on a canvas, which the test page does not have.
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
});

describe('Create Map → Upload New', () => {
  it('offers the map picture and the spirit layer picture a choice of Personal or this campaign', () => {
    render(<CreateMapModal isOpen campaignId="campaign-1" onClose={vi.fn()} onCreated={vi.fn()} />);
    const targets = screen.getAllByTestId('upload-target').map((t) => t.textContent);
    expect(targets).toEqual([
      'scope not locked|campaign not locked|campaign-1',
      'scope not locked|campaign not locked|campaign-1',
    ]);
  });
});
