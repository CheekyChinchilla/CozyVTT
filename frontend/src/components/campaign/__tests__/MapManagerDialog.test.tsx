/**
 * The Map Library is a dialog: announced by name, closed by Escape and a
 * named Close button. Escape in Create Map or Edit Map closes only that one.
 */

import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AxiosAdapter, AxiosInstance, AxiosResponse } from 'axios';
import MapManager from '../MapManager';
import { api } from '@/services/api';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'campaign-1', name: 'Lost Mine', currentMapId: null },
    currentMap: null,
    setCurrentMap: () => {},
    upsertCampaignMap: () => {},
    removeCampaignMap: () => {},
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/components/assets/AssetPicker', () => ({ default: () => null }));

const client = (api as unknown as { client: AxiosInstance }).client;
const cave = { id: 'map-1', campaignId: 'campaign-1', name: 'Cave', imageUrl: '', width: 10, height: 10, gridSize: 50, tokens: [] };

const listMaps: AxiosAdapter = (config) =>
  Promise.resolve({ data: { maps: [cave] }, status: 200, statusText: '', headers: {}, config } as AxiosResponse);

let browserAdapter: typeof client.defaults.adapter;

beforeEach(() => {
  browserAdapter = client.defaults.adapter;
  client.defaults.adapter = listMaps;
});

afterEach(() => {
  client.defaults.adapter = browserAdapter;
});

it('is announced by name, and Escape and its Close button close it', async () => {
  const onClose = vi.fn();
  render(<MapManager isOpen onClose={onClose} />);
  const dialog = screen.getByRole('dialog', { name: 'Map Library' });
  await screen.findByText('Cave');

  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledTimes(2);
});

it.each([
  ['Create Map', () => fireEvent.click(screen.getAllByRole('button', { name: /Create Map/ })[0])],
  ['Edit Map', () => fireEvent.click(screen.getByTitle('Edit map'))],
])('closes only %s on Escape', async (name, open) => {
  const onClose = vi.fn();
  render(<MapManager isOpen onClose={onClose} />);
  await screen.findByText('Cave');
  open();
  const child = await screen.findByRole('dialog', { name });

  fireEvent.keyDown(child, { key: 'Escape' });

  await waitFor(() => expect(screen.queryByRole('dialog', { name })).toBeNull());
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Map Library' })).toBeInTheDocument();
});
