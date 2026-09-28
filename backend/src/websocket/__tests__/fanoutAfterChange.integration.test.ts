/**
 * A change that has been saved is not reported as failed because telling the
 * table about it failed.
 *
 * The spirit-layer toggles and an initiative roll save their change, then
 * read the database again to tell everyone: the map to re-send, the roller's
 * name for the dice log. An error in that second part answered the DM with
 * "Failed to ...", for a change that stood, and skipped what came after it:
 * the chat notice, the order everyone should now see.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { toJson, readTokens } from '../../utils/prisma-json';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { setState, clearState } from '../initiativeState';

jest.setTimeout(30000);

const runId = randomUUID().slice(0, 8);
const GHOST = randomUUID();
const ORC = randomUUID();
let server: WsTestServer;
let dmId: string;
let campaignId: string;
let mapId: string;
let dm: ClientSocket;

const token = (id: string, extra: Record<string, unknown>) => ({
  id, name: id, imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token',
  visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {}, ...extra,
});
const boom = () => Promise.reject(new Error('database went away'));

beforeAll(async () => {
  dmId = (await prisma.user.create({ data: { email: `fanout-dm-${runId}@test.cozyvtt.local`, passwordHash: 'x', displayName: 'Fanout DM' } })).id;
  campaignId = (await prisma.campaign.create({ data: { name: `Fanout ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Fanout', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 10, height: 10, gridSize: 50, annotations: [], tokens: [],
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
});

beforeEach(async () => {
  jest.restoreAllMocks();
  clearState(campaignId);
  await prisma.campaign.update({ where: { id: campaignId }, data: { spiritLayerEnabled: false } });
  await prisma.map.update({ where: { id: mapId }, data: { tokens: toJson([token(GHOST, { layer: 'spirit', visible: false }), token(ORC, {})]) } });
  dm = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
});

afterEach(() => { jest.restoreAllMocks(); dm.disconnect(); });

afterAll(async () => {
  await server.close();
  clearState(campaignId);
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: dmId } });
  await prisma.$disconnect();
});

it('revealing the spirit layer stands, and is announced, when re-sending the map fails', async () => {
  jest.spyOn(prisma.map, 'findUnique').mockImplementationOnce(boom as never);
  const noError = expectNoEvent(dm, 'error', 800);
  const notice = waitForEvent<{ content: string }>(dm, 'chat.system');
  dm.emit('spirit_layer.toggle', { visible: true });
  expect((await notice).content).toMatch(/spirit layer/i);
  await expect(noError).resolves.toBeUndefined();
  const stored = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { spiritLayerEnabled: true } });
  expect(stored.spiritLayerEnabled).toBe(true);
});

it("revealing one spirit token stands when re-sending the map fails", async () => {
  jest.spyOn(prisma.campaign, 'findUnique').mockImplementationOnce(boom as never);
  const noError = expectNoEvent(dm, 'error', 800);
  dm.emit('spirit_layer.token.toggle', { mapId, tokenId: GHOST, visible: true });
  await expect(noError).resolves.toBeUndefined();
  const tokens = readTokens((await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } })).tokens);
  expect(tokens.find((t) => t.id === GHOST)?.visible).toBe(true);
});

it('a roll stands, and the new order goes out, when the dice log entry cannot be written', async () => {
  setState(campaignId, {
    active: true, round: 1, currentTokenId: null,
    combatants: [{ tokenId: ORC, mapId, name: 'Orc', imageUrl: '', initiative: null, hp: null, type: 'npc', disposition: null }],
  });
  jest.spyOn(prisma.user, 'findUnique').mockImplementationOnce(boom as never);
  const noError = expectNoEvent(dm, 'error', 800);
  const order = waitForEvent<{ combatants: Array<{ tokenId: string; initiative: number | null }> }>(dm, 'initiative.state');
  dm.emit('initiative.roll', { tokenId: ORC, mapId });
  const sent = await order;
  expect(typeof sent.combatants.find((c) => c.tokenId === ORC)?.initiative).toBe('number');
  await expect(noError).resolves.toBeUndefined();
});

// A map's live edits go through emitToMapReaders, which reads the campaign's
// current map after the edit is saved.
it('a wall added stands, and is not reported as failed, when telling the table fails', async () => {
  jest.spyOn(prisma.campaign, 'findUnique').mockImplementationOnce(boom as never);
  const noError = expectNoEvent(dm, 'error', 800);
  const segment = { id: randomUUID(), x1: 0, y1: 0, x2: 50, y2: 0, type: 'wall' };
  dm.emit('wall:add', { mapId, segment });
  await expect(noError).resolves.toBeUndefined();
  const stored = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { wallSegments: true } });
  expect((stored.wallSegments as Array<{ id: string }>).some((w) => w.id === segment.id)).toBe(true);
});

