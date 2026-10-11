/**
 * A picture uploaded from Create Map goes to the DM's personal library.
 *
 * It went to the campaign's library, where every member, spectators
 * included, can browse it, so a map prepared days ahead could be seen in the
 * Asset Library before the DM switched to it. A personal picture is read by
 * the players only once the map using it is the one on screen.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssetScope } from '@/types';

vi.mock('@/services/api', () => {
  const client = { getAssetUrl: (id: string) => `/api/assets/maps/${id}`, listAssets: vi.fn().mockResolvedValue({ assets: [], pagination: {} }) };
  return { api: client, default: client };
});
vi.mock('@/services/map.service', () => ({ default: { createMap: vi.fn() } }));
vi.mock('@/utils/detectMapGrid', () => ({ detectMapGrid: vi.fn().mockResolvedValue(null) }));
vi.mock('@/components/assets/AssetUploadModal', () => ({
  default: ({ defaultScope, defaultCampaignId }: { defaultScope?: AssetScope; defaultCampaignId?: string }) => (
    <span data-testid="upload-target">{`${defaultScope ?? 'none'}|${defaultCampaignId ?? 'no campaign'}`}</span>
  ),
}));

import CreateMapModal from '../CreateMapModal';

beforeAll(() => {
  // The preview draws on a canvas, which the test page does not have.
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
});

describe('Create Map → Upload New', () => {
  it('uploads the map picture and the spirit layer picture to the personal library', () => {
    render(<CreateMapModal isOpen campaignId="campaign-1" onClose={vi.fn()} onCreated={vi.fn()} />);
    const targets = screen.getAllByTestId('upload-target').map((t) => t.textContent);
    expect(targets).toEqual([`${AssetScope.USER}|no campaign`, `${AssetScope.USER}|no campaign`]);
  });
});
