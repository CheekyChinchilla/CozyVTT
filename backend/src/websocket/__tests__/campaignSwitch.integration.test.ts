/**
 * A socket that authenticates into a second campaign must leave the first.
 *
 * `authenticate` is meant to hold one campaign per socket: leave the old room,
 * tell it the user left, recompute its presence, then join the new one. That
 * block compared `socket.campaignId` with the new id after the membership
 * check had already overwritten it, so it never ran. The socket stayed in the
 * old room, kept every broadcast the old table sent, and carried the new
 * campaign's role while doing so, which the role-filtered fan-outs read.
 *
 * These drive the real socket server and re-authenticate one connection. The
 * shipped browser never does that (it opens a fresh socket per campaign); a
 * scripted client can.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { toJson } from '../../utils/prisma-json';
import {
  createWsTestServer,
  waitForEvent,
  expectNoEvent,
  WsTestServer,
} from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `switch-${name}-${runId}@test.cozyvtt.local`;

const SEEN_TOKEN = 'aaaaaaaa-0000-4000-8000-00000000c0de';
const HIDDEN_TOKEN = 'aaaaaaaa-0000-4000-8000-00000000d00d';

let server: WsTestServer;
let hostId: string;
let switcherId: string;
let campaignA: string;
let campaignB: string;
let mapA: string;
let hostCookie: string;
let switcherCookie: string;

type Presence = { campaignId: string; onlineUserIds: string[] };
type MapChanged = { mapId: string; mapData: { tokens: Array<{ id: string }> } };

/** Authenticate an already-connected socket into another campaign. */
async function reauth(client: ClientSocket, campaignId: string): Promise<void> {
  const done = waitForEvent<{ campaignId: string }>(client, 'authenticated');
  client.emit('authenticate', { campaignId });
  expect((await done).campaignId).toBe(campaignId);
}

beforeAll(async () => {
  const [host, switcher] = await Promise.all(
    ['host', 'switcher'].map((name) =>
      prisma.user.create({
        data: {
          email: email(name),
          passwordHash: 'not-used-by-socket-auth',
          displayName: `Switch ${name}`,
        },
      })
    )
  );
  hostId = host.id;
  switcherId = switcher.id;

  const [a, b] = await Promise.all([
    prisma.campaign.create({ data: { name: `Campaign A ${runId}`, ownerId: hostId, vibeSettings: {} } }),
    prisma.campaign.create({ data: { name: `Campaign B ${runId}`, ownerId: switcherId, vibeSettings: {} } }),
  ]);
  campaignA = a.id;
  campaignB = b.id;

  // The switcher is a player at A's table and the DM of B.
  await prisma.campaignMembership.createMany({
    data: [
      { userId: hostId, campaignId: campaignA, role: 'DM', characterIds: [] },
      { userId: switcherId, campaignId: campaignA, role: 'PLAYER', characterIds: [] },
      { userId: switcherId, campaignId: campaignB, role: 'DM', characterIds: [] },
    ],
  });

  // A map in A with one token players may see and one only the DM may.
  const base = { imageUrl: '', size: { width: 1, height: 1 }, rotation: 0, conditions: [] as string[], metadata: {} as Record<string, unknown>, layer: 'token', controlledBy: null };
  const map = await prisma.map.create({
    data: {
      campaignId: campaignA,
      name: 'Switch Map',
      imageUrl: '/api/assets/maps/placeholder',
      baseLayerUrl: '/api/assets/maps/placeholder',
      width: 20,
      height: 20,
      gridSize: 50,
      lightingEnabled: false,
      tokens: toJson([
        { ...base, id: SEEN_TOKEN, name: 'Guard', visible: true, position: { x: 2, y: 2 } },
        { ...base, id: HIDDEN_TOKEN, name: 'Assassin', visible: false, position: { x: 5, y: 5 }, notes: 'waiting in the rafters' },
      ]),
      annotations: toJson([]),
      wallSegments: toJson([]),
    },
  });
  mapA = map.id;

  server = await createWsTestServer();
  [hostCookie, switcherCookie] = await Promise.all([server.loginAs(hostId), server.loginAs(switcherId)]);
});

afterAll(async () => {
  await server?.close();
  await prisma.map.deleteMany({ where: { id: mapA } });
  await prisma.campaign.deleteMany({ where: { id: { in: [campaignA, campaignB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [hostId, switcherId] } } });
  await prisma.$disconnect();
});

describe('authenticating into another campaign on the same socket', () => {
  it('stops hearing the campaign it left, and hears the one it joined', async () => {
    const host = await server.connectAndAuth(hostCookie, campaignA);
    const switcher = await server.connectAndAuth(switcherCookie, campaignA);

    const heard = waitForEvent(switcher, 'chat.message');
    host.emit('chat.message', { content: 'before the switch', type: 'DM' });
    await expect(heard).resolves.toBeDefined();

    await reauth(switcher, campaignB);

    const silence = expectNoEvent(switcher, 'chat.message', 500);
    host.emit('chat.message', { content: 'after the switch', type: 'DM' });
    await expect(silence).resolves.toBeUndefined();

    const echoed = waitForEvent<{ content: string }>(switcher, 'chat.message');
    switcher.emit('chat.message', { content: 'at my own table', type: 'DM' });
    expect((await echoed).content).toBe('at my own table');

    host.disconnect();
    switcher.disconnect();
  });

  it('tells the campaign it left, and drops it from that presence roster', async () => {
    const host = await server.connectAndAuth(hostCookie, campaignA);
    // Consume the presence update the switcher's arrival will send, so the
    // one asserted on below is the one the switch sends.
    const arrival = waitForEvent<Presence>(host, 'presence.state');
    const switcher = await server.connectAndAuth(switcherCookie, campaignA);
    expect((await arrival).onlineUserIds).toContain(switcherId);

    const left = waitForEvent<{ userId: string }>(host, 'user.left');
    const presence = waitForEvent<Presence>(host, 'presence.state');
    await reauth(switcher, campaignB);

    expect((await left).userId).toBe(switcherId);
    const roster = await presence;
    expect(roster.campaignId).toBe(campaignA);
    expect(roster.onlineUserIds).toContain(hostId);
    expect(roster.onlineUserIds).not.toContain(switcherId);

    host.disconnect();
    switcher.disconnect();
  });

  it('never applies the new role to the room it left', async () => {
    const host = await server.connectAndAuth(hostCookie, campaignA);
    const switcher = await server.connectAndAuth(switcherCookie, campaignA);

    // As a player at A's table, the hidden token is withheld.
    const asPlayer = waitForEvent<MapChanged>(switcher, 'map.changed');
    host.emit('map.change', { mapId: mapA });
    const seen = (await asPlayer).mapData.tokens.map((t) => t.id);
    expect(seen).toContain(SEEN_TOKEN);
    expect(seen).not.toContain(HIDDEN_TOKEN);

    // Now a DM elsewhere. A's fan-out must not reach this socket at all,
    // let alone with the DM's copy of A's map.
    await reauth(switcher, campaignB);
    const nothing = expectNoEvent(switcher, 'map.changed', 500);
    host.emit('map.change', { mapId: mapA });
    await expect(nothing).resolves.toBeUndefined();

    host.disconnect();
    switcher.disconnect();
  });
});
