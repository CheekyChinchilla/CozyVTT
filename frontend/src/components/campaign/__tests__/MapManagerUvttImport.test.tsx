/**
 * A Universal VTT import shows the server's answer, however long it takes.
 *
 * Once the upload has arrived, the server can take up to 50 seconds to
 * answer: an import waits up to 20 seconds behind other DMs' imports, then
 * runs for up to 30, and reaching either limit answers 503 with a message
 * saying which. The request used to share every request's 30-second timeout,
 * which counts the upload as well, so the page gave up first and showed only
 * "Failed to import UVTT file.", while an import already running could still
 * save the map.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
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
    campaign: { id: 'campaign-1', name: 'Lost Mine', currentMapId: null },
    currentMap: null,
    setCurrentMap: () => {},
    upsertCampaignMap: () => {},
    removeCampaignMap: () => {},
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));

const client = (api as unknown as { client: AxiosInstance }).client;

const BUSY = 'Another map import is running on the server. Try again in a minute.';
const TOO_SLOW = 'This map import took longer than 30 seconds and was stopped, so nothing was saved. Try again in a minute.';

/** What the server answers the import with, and how long after it is sent. */
let reply: { afterMs: number; status: number; data: unknown };

/**
 * The network as a browser runs it. The server answers the import after
 * `reply.afterMs`, and the map list at once. A request whose timeout is above
 * zero gives up with no answer once that time has passed, upload included.
 */
const network: AxiosAdapter = (config) => {
  const response = (status: number, data: unknown): AxiosResponse => ({ data, status, statusText: '', headers: {}, config });
  if (config.method === 'get') return Promise.resolve(response(200, { maps: [] }));
  return new Promise((resolve, reject) => {
    const timeout = config.timeout ?? 0;
    if (timeout > 0 && timeout < reply.afterMs) {
      setTimeout(() => reject(new AxiosError(`timeout of ${timeout}ms exceeded`, AxiosError.ECONNABORTED, config)), timeout);
      return;
    }
    setTimeout(() => {
      const answer = response(reply.status, reply.data);
      if (reply.status < 400) resolve(answer);
      else reject(new AxiosError(`Request failed with status code ${reply.status}`, AxiosError.ERR_BAD_RESPONSE, config, undefined, answer));
    }, reply.afterMs);
  });
};

let browserAdapter: typeof client.defaults.adapter;

beforeEach(() => {
  vi.useFakeTimers();
  browserAdapter = client.defaults.adapter;
  client.defaults.adapter = network;
});

afterEach(() => {
  client.defaults.adapter = browserAdapter;
  vi.useRealTimers();
});

/** Open the Map Library, choose a .uvtt file, and wait `ms` for the answer. */
async function importAndWait(ms: number): Promise<void> {
  const { container } = render(<MapManager isOpen onClose={() => {}} />);
  await act(() => vi.advanceTimersByTimeAsync(0));
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('The Map Library has no file input');
  fireEvent.change(input, { target: { files: [new File(['{}'], 'cave.uvtt')] } });
  await act(() => vi.advanceTimersByTimeAsync(0));
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

describe('importing a Universal VTT file in the Map Library', () => {
  // The busy answer comes 20 seconds after the upload, here a 25-second
  // upload; the time-limit answer up to 50 seconds after it, here a 5-second
  // upload, a full wait and a full run.
  it.each([
    ['could not start within 20 seconds', 45_000, BUSY],
    ['ran past its 30 seconds', 55_000, TOO_SLOW],
  ])('shows the server\'s message when the import %s, though it comes after 30 seconds', async (_case, afterMs, message) => {
    reply = { afterMs, status: 503, data: { error: 'Service Unavailable', message } };

    await importAndWait(afterMs);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText('Failed to import UVTT file.')).not.toBeInTheDocument();
  });

  it('shows the imported map when the answer comes after 30 seconds', async () => {
    const map = { id: 'map-9', name: 'Cave', width: 20, height: 20, gridSize: 70, imageUrl: null };
    reply = { afterMs: 40_000, status: 201, data: { map, wallCount: 3, portalCount: 0, totalSegments: 12, lightCount: 0 } };

    await importAndWait(40_000);

    expect(screen.getByText('Imported "Cave" with 12 wall segments')).toBeInTheDocument();
    expect(screen.queryByText('Failed to import UVTT file.')).not.toBeInTheDocument();
  });
});
