/**
 * A fog operation names at most 250,000 cells.
 *
 * A cell is a grid square and the largest map is 500 by 500, so no box on
 * any map names more. The operation's list had no maximum, unlike explored
 * memory's report and a campaign archive's fog; both paths, the socket
 * event and the REST route, now refuse a longer one with a written reason
 * and store nothing.
 *
 * The oversized operations repeat one small index: distinct indices that
 * many would pass the 1 MB transport and body limits first.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import type { Socket as ClientSocket } from 'socket.io-client';

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, type WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { MAX_FOG_CELLS } from '../../validators/maps';
import { TOO_MANY_FOG_CELLS_MESSAGE } from '../../validators/walls';

jest.setTimeout(30000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let campaignId: string;
let mapId: string;
let agent: ReturnType<typeof request.agent>;
let page: ClientSocket;

const cells = (count: number) => new Array<number>(count).fill(0);
const operation = (body: object) => agent.post(`/api/campaigns/${campaignId}/maps/${mapId}/fog/operation`).send(body);
const storedFog = async () => (await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { fogData: true } })).fogData;

/** Which of `events` the page is sent first, and what it carried. */
function firstOf(client: ClientSocket, events: string[], timeoutMs = 5000): Promise<{ event: string; data: unknown }> {
  return new Promise((resolve, reject) => {
    const handlers = events.map((event) => {
      const handler = (data: unknown) => { finish(); resolve({ event, data }); };
      client.on(event, handler);
      return { event, handler };
    });
    const timer = setTimeout(() => { finish(); reject(new Error(`none of ${events.join(', ')} within ${timeoutMs}ms`)); }, timeoutMs);
    function finish() {
      clearTimeout(timer);
      for (const { event, handler } of handlers) client.off(event, handler);
    }
  });
}

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dm = await createTestUser({ email: `fogcells-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  dmId = dm.id;
  campaignId = (await createTestCampaign(dmId, { name: `Fog cells ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Fogged', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 4, height: 4, gridSize: 50, tokens: [], annotations: [], fogEnabled: true,
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: dm.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
  page = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
});

beforeEach(async () => {
  await prisma.map.update({ where: { id: mapId }, data: { fogData: Prisma.JsonNull } });
});

afterAll(async () => {
  page?.disconnect();
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

describe('POST .../fog/operation', () => {
  it('refuses a reveal of more cells than the largest map has, and stores nothing', async () => {
    const res = await operation({ op: 'reveal', cells: cells(MAX_FOG_CELLS + 1) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Validation Error', message: TOO_MANY_FOG_CELLS_MESSAGE });
    expect(await storedFog()).toBeNull();
  });

  it('applies one of exactly that many', async () => {
    const res = await operation({ op: 'reveal', cells: cells(MAX_FOG_CELLS) });
    expect(res.status).toBe(200);
    expect(res.body.fogState.revealed[0]).toBe(true);
  });
});

describe('fog:operation', () => {
  it('refuses a hide of more cells than the largest map has, and stores nothing', async () => {
    const answer = firstOf(page, ['error', 'fog:updated']);
    page.emit('fog:operation', { mapId, operation: { op: 'hide', cells: cells(MAX_FOG_CELLS + 1) } });
    expect(await answer).toEqual({ event: 'error', data: { message: TOO_MANY_FOG_CELLS_MESSAGE } });
    expect(await storedFog()).toBeNull();
  });

  it('applies one of exactly that many', async () => {
    const answer = firstOf(page, ['error', 'fog:updated']);
    page.emit('fog:operation', { mapId, operation: { op: 'reveal', cells: cells(MAX_FOG_CELLS) } });
    const { event, data } = await answer;
    expect(event).toBe('fog:updated');
    expect((data as { fogState: { revealed: boolean[] } }).fogState.revealed[0]).toBe(true);
  });
});

describe('the message', () => {
  it('states the cap', () => {
    expect(TOO_MANY_FOG_CELLS_MESSAGE).toBe('A fog operation can name at most 250,000 cells. Use reveal_all or hide_all for the whole map.');
  });
});
