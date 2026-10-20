/**
 * Export as .uvtt says why the server refused, and saves only a real file.
 *
 * The button handed the browser a download link, so a refusal (a map with no
 * picture, or one that is not a PNG, JPEG, WebP or GIF image) was never shown
 * and the browser saved the server's error as the .uvtt file. The file is
 * now fetched first: it is saved once it has arrived, and a refusal shows
 * the server's message instead.
 */

import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AxiosAdapter, AxiosInstance, AxiosResponse } from 'axios';
import MapManager from '../MapManager';
import { api } from '@/services/api';

vi.mock('framer-motion', () => {
  const MotionDiv = (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  };
  return {
    useReducedMotionConfig: () => false,
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});
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

const client = (api as unknown as { client: AxiosInstance }).client;
const cave = { id: 'map-1', campaignId: 'campaign-1', name: 'Cave', imageUrl: '', width: 10, height: 10, gridSize: 50, tokens: [] };

const listMaps: AxiosAdapter = (config) =>
  Promise.resolve({ data: { maps: [cave] }, status: 200, statusText: '', headers: {}, config } as AxiosResponse);

let browserAdapter: typeof client.defaults.adapter;
const fetchMock = vi.fn();
const clicked = vi.fn();

beforeEach(() => {
  browserAdapter = client.defaults.adapter;
  client.defaults.adapter = listMaps;
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:cave');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked(this.download, this.href);
  });
  fetchMock.mockReset();
  clicked.mockReset();
});

afterEach(() => {
  client.defaults.adapter = browserAdapter;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function exportCave() {
  render(<MapManager isOpen onClose={() => {}} />);
  fireEvent.click(await screen.findByTitle('Export as .uvtt file'));
}

it('shows why the export was refused, and saves nothing', async () => {
  const reason = 'This map\'s picture is not a PNG, JPEG, WebP or GIF image, so it cannot be exported as Universal VTT.';
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Unprocessable Entity', message: reason }), { status: 422 }));
  await exportCave();

  expect(await screen.findByText(reason)).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/campaigns/campaign-1/maps/map-1/export-uvtt', { credentials: 'include' });
  expect(clicked).not.toHaveBeenCalled();
});

it('saves the file once it has arrived, named after the map', async () => {
  fetchMock.mockResolvedValue(new Response('{"format":1}', { status: 200 }));
  await exportCave();

  await waitFor(() => expect(clicked).toHaveBeenCalledWith('Cave.uvtt', 'blob:cave'));
});
