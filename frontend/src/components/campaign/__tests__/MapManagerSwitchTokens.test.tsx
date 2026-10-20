/**
 * Switching maps stops when the tokens on the current map cannot be read.
 *
 * Switching first reads the tokens on the map on screen, to offer to bring
 * them along. When that read failed, the switch went ahead without the
 * offer and said nothing, so the party could be left behind without the DM
 * being asked. It now stops and says why; the DM can switch again.
 */

import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AxiosError } from 'axios';
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
    campaign: { id: 'campaign-1', name: 'Lost Mine', currentMapId: 'map-1' },
    currentMap: { id: 'map-1', name: 'Cave', tokens: [] },
    setCurrentMap: () => {},
    upsertCampaignMap: () => {},
    removeCampaignMap: () => {},
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));

const client = (api as unknown as { client: AxiosInstance }).client;
const map = (id: string, name: string) => ({ id, campaignId: 'campaign-1', name, imageUrl: '', width: 10, height: 10, gridSize: 50, tokens: [] });
const requests: string[] = [];

const network: AxiosAdapter = (config) => {
  requests.push(`${config.method} ${config.url}`);
  const answer = (status: number, data: unknown) => ({ data, status, statusText: '', headers: {}, config }) as AxiosResponse;
  if (config.method === 'get' && config.url === '/api/campaigns/campaign-1/maps') {
    return Promise.resolve(answer(200, { maps: [map('map-1', 'Cave'), map('map-2', 'Forest')] }));
  }
  if (config.method === 'get' && config.url === '/api/campaigns/campaign-1/maps/map-1') {
    return Promise.reject(new AxiosError('Request failed with status code 429', AxiosError.ERR_BAD_REQUEST, config, undefined,
      answer(429, { error: 'Too Many Requests', message: 'Too many requests, please slow down' })));
  }
  return Promise.reject(new Error(`unexpected ${config.method} ${config.url}`));
};

let browserAdapter: typeof client.defaults.adapter;
beforeEach(() => {
  requests.length = 0;
  browserAdapter = client.defaults.adapter;
  client.defaults.adapter = network;
});
afterEach(() => {
  client.defaults.adapter = browserAdapter;
});

it('stops the switch and says why when the current map\'s tokens cannot be read', async () => {
  render(<MapManager isOpen onClose={() => {}} />);
  // Cave is on screen, so only Forest offers the switch.
  fireEvent.click(await screen.findByTitle('Set as active map'));

  expect(await screen.findByText('Too many requests, please slow down')).toBeInTheDocument();
  expect(requests.filter((r) => r.startsWith('put'))).toEqual([]);
});
