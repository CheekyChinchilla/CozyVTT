/**
 * Deleting a drawn map from the Map Library: the question offers a box,
 * "Also delete its picture from the Asset Library", for a map whose picture
 * Paint made, never for an uploaded one, and unticked. Ticked, the picture
 * goes once the map has, without force, so a picture something else still
 * uses stays, which the library says.
 */

import { it, expect, vi, beforeEach, afterEach, describe } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
    useIsPresent: () => true,
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'campaign-1', name: 'Lost Mine', currentMapId: 'village' },
    currentMap: { id: 'village', name: 'Village', tokens: [] },
    viewedMap: { id: 'village', name: 'Village', tokens: [] },
    isPreparing: false,
    setCurrentMap: () => {},
    updateMap: () => {},
    showTableMap: () => {},
    openToPrepare: () => Promise.resolve(true),
    mayChangeViewedMap: () => Promise.resolve(true),
    upsertCampaignMap: () => {},
    removeCampaignMap: () => {},
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/components/assets/AssetPicker', () => ({ default: () => null }));

const client = (api as unknown as { client: AxiosInstance }).client;
let picture = 'pic-1';
let tags = ['drawn-map'];
let assetDeleteStatus = 200;
const requests: string[] = [];

const map = (id: string, name: string, imageUrl: string) => ({ id, campaignId: 'campaign-1', name, imageUrl, width: 10, height: 10, gridSize: 50, tokens: [] });
const network: AxiosAdapter = (config) => {
  const params = config.params ? `?${new URLSearchParams(config.params as Record<string, string>).toString()}` : '';
  requests.push(`${config.method} ${config.url}${params}`);
  const answer = (data: unknown, status = 200) => (status >= 400
    ? Promise.reject(Object.assign(new Error('refused'), { isAxiosError: true, response: { data, status, statusText: '', headers: {}, config } }))
    : Promise.resolve({ data, status, statusText: '', headers: {}, config } as AxiosResponse));
  if (config.method === 'get' && config.url === '/api/campaigns/campaign-1/maps') {
    return answer({ maps: [map('village', 'Village', '/api/assets/maps/village-pic'), map('crypt', 'Crypt', `/api/assets/maps/${picture}`)] });
  }
  if (config.method === 'get' && config.url === `/api/assets/${picture}`) {
    return answer({ asset: { id: picture, type: 'MAP', scope: 'CAMPAIGN', campaignId: 'campaign-1', tags } });
  }
  if (config.method === 'delete' && config.url === `/api/assets/${picture}`) {
    return assetDeleteStatus === 409
      ? answer({ code: 'ASSET_IN_USE', message: 'This asset is in use.' }, 409)
      : answer({ message: 'deleted' });
  }
  return answer({ message: 'ok' });
};

let browserAdapter: typeof client.defaults.adapter;
let count = 0;
beforeEach(() => {
  // A picture of its own each test: the page asks for a picture's tags once a session.
  count += 1;
  picture = `pic-${count}`;
  tags = ['drawn-map'];
  assetDeleteStatus = 200;
  requests.length = 0;
  browserAdapter = client.defaults.adapter;
  client.defaults.adapter = network;
});
afterEach(() => {
  client.defaults.adapter = browserAdapter;
});

async function askToDeleteCrypt() {
  render(<MapManager isOpen onClose={() => {}} />);
  const card = (await screen.findByRole('heading', { name: 'Crypt' })).closest('div.rounded-xl') as HTMLElement;
  fireEvent.click(within(card).getByRole('button', { name: 'Delete map' }));
  return screen.getByRole('dialog', { name: 'Delete Map' });
}
const box = () => screen.queryByRole('checkbox', { name: 'Also delete its picture from the Asset Library' });
const confirm = async (dialog: HTMLElement) => {
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' })); });
  await act(async () => { await Promise.resolve(); });
};

describe('deleting a drawn map', () => {
  it('offers to delete its picture too, unticked, and deletes only the map unless ticked', async () => {
    const dialog = await askToDeleteCrypt();
    expect(await screen.findByRole('checkbox', { name: 'Also delete its picture from the Asset Library' })).not.toBeChecked();
    await confirm(dialog);
    expect(requests).toContain('delete /api/campaigns/campaign-1/maps/crypt');
    expect(requests.filter((r) => r.startsWith('delete /api/assets'))).toEqual([]);
  });

  it('deletes the picture after the map when ticked, without force', async () => {
    const dialog = await askToDeleteCrypt();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Also delete its picture from the Asset Library' }));
    await confirm(dialog);
    const deletes = requests.filter((r) => r.startsWith('delete'));
    expect(deletes).toEqual(['delete /api/campaigns/campaign-1/maps/crypt', `delete /api/assets/${picture}`]);
  });

  it('keeps a picture something else uses, and says so', async () => {
    assetDeleteStatus = 409;
    const dialog = await askToDeleteCrypt();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Also delete its picture from the Asset Library' }));
    await confirm(dialog);
    expect(await screen.findByText('Crypt is deleted. Its picture is used elsewhere, so it stays in the Asset Library.')).toBeInTheDocument();
  });

  it('offers no such box for a map whose picture was uploaded', async () => {
    tags = ['dungeon'];
    await askToDeleteCrypt();
    await act(async () => { await Promise.resolve(); });
    expect(requests).toContain(`get /api/assets/${picture}`);
    expect(box()).toBeNull();
  });
});
