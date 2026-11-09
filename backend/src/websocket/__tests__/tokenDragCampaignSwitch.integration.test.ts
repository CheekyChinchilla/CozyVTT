/**
 * A drag frame from a connection that has since joined another campaign
 * reaches nobody in that campaign.
 *
 * A frame is checked against the campaign its connection is in, and then
 * waits on the plane check (a database read for a spirit-plane token moved
 * by anyone but the DM). Joining another campaign forgets the drags of the
 * one left, so a frame that was waiting decided who its drag goes to afresh,
 * among the new campaign's members, and sent them a token of a map that is
 * not theirs.
 *
 * To make the overlap happen every time, the frame's plane check is held
 * while the connection joins the other campaign.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';

/** The next plane check to hold: it says when it is reached, and waits for `until`. */
let mockHold: { reached: () => void; until: Promise<void> } | null = null;
jest.mock('../../utils/spirit-layer', () => {
  const actual = jest.requireActual('../../utils/spirit-layer');
  return {
    ...actual,
    canActOnTokenPlane: async (...args: Parameters<typeof actual.canActOnTokenPlane>) => {
      const held = mockHold;
      if (held) {
        mockHold = null;
        held.reached();
        await held.until;
      }
      return actual.canActOnTokenPlane(...args);
    },
  };
});

import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);

let server: WsTestServer;
let dmId: string;
let otherDmId: string;
let playerId: string;
let campaignId: string;
let otherCampaignId: string;
let mapId: string;

beforeAll(async () => {
  const [dm, otherDm, player] = await Promise.all(['dm', 'otherdm', 'player'].map((name) =>
    prisma.user.create({ data: { email: `dragswitch-${name}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Switch ${name}` } })));
  dmId = dm.id;
  otherDmId = otherDm.id;
  playerId = player.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Drag switch ${runId}`, ownerId: dmId, vibeSettings: {}, status: 'ACTIVE' } })).id;
  otherCampaignId = (await prisma.campaign.create({ data: { name: `Drag elsewhere ${runId}`, ownerId: otherDmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: otherDmId, campaignId: otherCampaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId: otherCampaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Switch', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 20, height: 20, annotations: [], lightingEnabled: false,
      tokens: [{ id: 'hero', name: 'Hero', imageUrl: '', position: { x: 2, y: 3 }, size: { width: 1, height: 1 }, layer: 'token', visible: true, controlledBy: playerId, rotation: 0, conditions: [], metadata: {} }],
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, otherCampaignId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, otherDmId, playerId] } } });
  await prisma.$disconnect();
});

it('sends a frame still being checked when its connection joins another campaign to nobody there', async () => {
  const dm = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
  const otherDm = await server.connectAndAuth(await server.loginAs(otherDmId), otherCampaignId);
  const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);

  const frame = waitForEvent(dm, 'token.moved');
  player.emit('token.move.start', { tokenId: 'hero', mapId });
  player.emit('token.move', { tokenId: 'hero', mapId, x: 9, y: 9 });
  await frame;

  // The next frame waits on its plane check while the connection joins the
  // other campaign; past the throttle's wait, so it is not folded into the last.
  let reached!: () => void;
  const atCheck = new Promise<void>((resolve) => { reached = resolve; });
  let release!: () => void;
  mockHold = { reached, until: new Promise<void>((resolve) => { release = resolve; }) };
  await new Promise((resolve) => setTimeout(resolve, 50));
  player.emit('token.move', { tokenId: 'hero', mapId, x: 10, y: 10 });
  await atCheck;
  const joined = waitForEvent(player, 'authenticated');
  player.emit('authenticate', { campaignId: otherCampaignId });
  await joined;

  const noMove = expectNoEvent(otherDm, 'token.moved', 800);
  const noToken = expectNoEvent(otherDm, 'token:appeared', 800);
  release();
  await noMove;
  await noToken;

  player.disconnect();
  otherDm.disconnect();
  dm.disconnect();
});
