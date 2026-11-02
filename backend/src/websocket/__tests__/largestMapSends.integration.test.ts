/**
 * What the live table takes of fog and explored ground on the largest map,
 * 500 by 500 squares.
 *
 * The server reads no message longer than MAX_SOCKET_MESSAGE_BYTES, which
 * the web client sends a fog box longer than one message in parts under,
 * and takes a report of at most MAX_EXPLORATION_REPORT_CELLS explored
 * squares, which it sends a larger sight in. Here a message of exactly the
 * limit is read and one byte longer is not, and the whole map's explored
 * ground, in reports of the most squares one may name, is all remembered.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { MAP_LIMITS, MAX_EXPLORATION_REPORT_CELLS, MAX_FOG_CELLS, MAX_SOCKET_MESSAGE_BYTES } from '../../validators/mapLimits';
import { REVEALS_PER_SECOND } from '../handlers/exploration';

jest.setTimeout(30000);

const runId = randomUUID().slice(0, 8);
const SIDE = MAP_LIMITS.maxSide;

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let playerCookie: string;

/** A message's length in bytes as the server reads it: the packet types, then the event and its payload as JSON. */
const messageBytes = (event: string, payload: unknown) => Buffer.byteLength(`42${JSON.stringify([event, payload])}`);

/**
 * A reveal of distinct squares whose fog:operation message is exactly
 * `bytes` long: six-digit squares, and as many five-digit ones in their
 * place as it takes to come out even.
 */
function revealOfLength(bytes: number): { mapId: string; operation: { op: 'reveal'; cells: number[] } } {
  const empty = messageBytes('fog:operation', { mapId, operation: { op: 'reveal', cells: [] } });
  // Each six-digit square takes seven bytes with its comma, less one comma.
  const room = bytes - empty + 1;
  const count = Math.ceil(room / 7);
  const shorter = count * 7 - room;
  const cells = Array.from({ length: count }, (_, i) => (i < shorter ? 10000 + i : 100000 + i));
  return { mapId, operation: { op: 'reveal', cells } };
}

/** The squares the map's stored fog has revealed. */
async function revealedCount(): Promise<number> {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { fogData: true } });
  return ((map.fogData as { revealed?: boolean[] } | null)?.revealed ?? []).filter(Boolean).length;
}

beforeAll(async () => {
  const [dm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({ data: { email: `largestsends-${name}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Largest ${name}` } })
    )
  );
  dmId = dm.id;
  playerId = player.id;
  const campaign = await prisma.campaign.create({ data: { name: `Largest sends ${runId}`, ownerId: dmId, vibeSettings: {} } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'The Wastes', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: SIDE, height: SIDE, gridSize: MAP_LIMITS.minGridSize, tokens: [], annotations: [],
      fogEnabled: true, lightingEnabled: true, explorationEnabled: true,
    },
  });
  mapId = map.id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  [dmCookie, playerCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(playerId)]);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.mapExploration.deleteMany({ where: { mapId } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

describe('a fog operation on the largest map', () => {
  it('is not read one byte past the message limit: the connection closes and nothing is stored', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const message = revealOfLength(MAX_SOCKET_MESSAGE_BYTES + 1);
    expect(messageBytes('fog:operation', message)).toBe(MAX_SOCKET_MESSAGE_BYTES + 1);
    const closed = waitForEvent<string>(dm, 'disconnect');

    dm.emit('fog:operation', message);

    await closed;
    expect(await revealedCount()).toBe(0);
  });

  it('is read and stored at exactly the message limit', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const message = revealOfLength(MAX_SOCKET_MESSAGE_BYTES);
    expect(messageBytes('fog:operation', message)).toBe(MAX_SOCKET_MESSAGE_BYTES);
    const stored = waitForEvent<{ mapId: string }>(dm, 'fog:updated', 10000);

    dm.emit('fog:operation', message);

    expect((await stored).mapId).toBe(mapId);
    expect(await revealedCount()).toBe(message.operation.cells.length);
    dm.disconnect();
  });
});

describe("a player's explored ground on the largest map", () => {
  it('is all remembered when every square is reported, in reports of the most squares one may name', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const every = Array.from({ length: MAX_FOG_CELLS }, (_, i) => i);
    const whole = new Promise<number[]>((resolve) => {
      player.on('exploration:state', (state: { cells: number[] }) => {
        if (state.cells.length === MAX_FOG_CELLS) resolve(state.cells);
      });
    });

    for (let start = 0; start < every.length; start += MAX_EXPLORATION_REPORT_CELLS) {
      const report = { mapId, cells: every.slice(start, start + MAX_EXPLORATION_REPORT_CELLS) };
      expect(messageBytes('exploration:reveal', report)).toBeLessThanOrEqual(MAX_SOCKET_MESSAGE_BYTES);
      player.emit('exploration:reveal', report);
    }

    expect(await whole).toEqual(every);
    player.disconnect();
  });

  it('takes the whole map in one second of reports', () => {
    expect(Math.ceil(MAX_FOG_CELLS / MAX_EXPLORATION_REPORT_CELLS)).toBeLessThanOrEqual(REVEALS_PER_SECOND);
  });
});
