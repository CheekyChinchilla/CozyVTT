/**
 * Edit Map keeps the map's spirit layer picture unless the DM changes it.
 *
 * The dialog is opened from the Map Library's list, whose maps carry no
 * spirit layer picture. It filled its picker from that, showed no picture,
 * and sent `spiritLayerUrl: null` with every save, so changing only a map's
 * name removed its spirit layer. It now reads the whole map to show the
 * picture, and sends only what the DM changed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Asset, Map as CampaignMap, UpdateMapRequest } from '@/types';

const getMap = vi.fn();
const updateMap = vi.fn();
vi.mock('@/services/map.service', () => ({
  default: {
    getMap: (...a: unknown[]) => getMap(...a),
    updateMap: (...a: unknown[]) => updateMap(...a),
  },
}));
vi.mock('@/services/api', () => {
  const client = { getAssetUrl: (id: string) => `/api/assets/maps/${id}` };
  return { api: client, default: client };
});
vi.mock('@/utils/detectMapGrid', () => ({ detectMapGrid: vi.fn().mockResolvedValue(null) }));

// The picker's own asset loading is not under test: it shows what is
// selected and lets the test pick or clear.
vi.mock('@/components/assets/AssetPicker', () => ({
  default: ({ label, selectedAssetId, onSelect }: { label: string; selectedAssetId: string | null; onSelect: (a: Asset | null) => void }) => (
    <div>
      <span>{`${label}: ${selectedAssetId ?? 'none'}`}</span>
      <button type="button" onClick={() => onSelect(null)}>{`Clear ${label}`}</button>
      <button type="button" onClick={() => onSelect({ id: 'picked-asset' } as Asset)}>{`Pick ${label}`}</button>
    </div>
  ),
}));

import EditMapModal from '../EditMapModal';

const SPIRIT = 'Spirit Layer Image (optional)';

/** A map as the Map Library's list returns it: no spirit layer field at all. */
const listed = {
  id: 'map-1',
  name: 'The Sunken Crown',
  imageUrl: '/api/assets/maps/map-asset',
  width: 20,
  height: 15,
  gridSize: 50,
  feetPerSquare: 5,
  diagonalRule: 'flat',
  lightingEnabled: true,
  fogEnabled: true,
  globalIllumination: false,
  explorationEnabled: true,
} as unknown as CampaignMap;

const full = { ...listed, spiritLayerUrl: '/api/assets/maps/spirit-asset', tokens: [] } as unknown as CampaignMap;

function open() {
  const onUpdated = vi.fn();
  const onClose = vi.fn();
  render(<EditMapModal isOpen map={listed} campaignId="campaign-1" onClose={onClose} onUpdated={onUpdated} />);
  return { onUpdated, onClose };
}

function sent(): UpdateMapRequest {
  expect(updateMap).toHaveBeenCalledTimes(1);
  return updateMap.mock.calls[0][2] as UpdateMapRequest;
}

beforeEach(() => {
  getMap.mockReset().mockResolvedValue(full);
  updateMap.mockReset().mockImplementation(async (_c: string, _id: string, data: UpdateMapRequest) => ({ ...full, ...data }));
});

describe('Edit Map and the spirit layer', () => {
  it('shows the stored spirit layer picture of a map opened from the list', async () => {
    open();
    expect(await screen.findByText(`${SPIRIT}: spirit-asset`)).toBeInTheDocument();
    expect(getMap).toHaveBeenCalledWith('campaign-1', 'map-1');
  });

  it('leaves the spirit layer out of a save that only renames the map', async () => {
    open();
    await screen.findByText(`${SPIRIT}: spirit-asset`);
    fireEvent.change(screen.getByPlaceholderText('Map name...'), { target: { value: 'The Drowned Crown' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(updateMap).toHaveBeenCalled());
    expect(sent()).toEqual({ name: 'The Drowned Crown' });
  });

  it('leaves it out even when the whole map could not be read', async () => {
    getMap.mockRejectedValue(new Error('offline'));
    open();
    fireEvent.change(screen.getByPlaceholderText('Map name...'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(updateMap).toHaveBeenCalled());
    expect(sent()).not.toHaveProperty('spiritLayerUrl');
  });

  it('clears the spirit layer when the DM clears it', async () => {
    open();
    await screen.findByText(`${SPIRIT}: spirit-asset`);
    fireEvent.click(screen.getByText(`Clear ${SPIRIT}`));
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(updateMap).toHaveBeenCalled());
    expect(sent()).toEqual({ spiritLayerUrl: null });
  });

  it('keeps a picture the DM picked before the whole map arrived', async () => {
    let answer: (m: CampaignMap) => void = () => undefined;
    getMap.mockReturnValue(new Promise<CampaignMap>((resolve) => { answer = resolve; }));
    open();
    fireEvent.click(screen.getByText(`Pick ${SPIRIT}`));
    answer(full);

    await waitFor(() => expect(getMap).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => expect(updateMap).toHaveBeenCalled());
    expect(sent()).toEqual({ spiritLayerUrl: 'picked-asset' });
  });

  it('sends the fields the DM changed, and only those', async () => {
    open();
    await screen.findByText(`${SPIRIT}: spirit-asset`);
    fireEvent.click(screen.getByLabelText('Fog of war on this map'));
    fireEvent.click(screen.getByText('10 ft'));
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(updateMap).toHaveBeenCalled());
    expect(sent()).toEqual({ fogEnabled: false, feetPerSquare: 10 });
  });
});
