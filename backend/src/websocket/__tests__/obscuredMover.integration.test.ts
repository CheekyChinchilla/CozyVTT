/**
 * Who is told who moved an obscured token.
 *
 * Every move event names the mover in `movedBy`. For an obscured token that
 * is its controller, which is part of what obscuring hides: the campaign
 * roster maps the id to a name. So while a token is obscured, only the DM and
 * the mover's own screens are told who moved it; anyone else gets null. A
 * token that is not obscured names its mover to everyone, as before.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `obscuredmover-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let ownerId: string;
let otherId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let ownerCookie: string;
let otherCookie: string;

const VEILED = 'token-veiled';
const PLAIN = 'token-plain';

function token(id: string, controlledBy: string | null, obscured: boolean) {
  return {
    id,
    name: id,
    imageUrl: '',
    position: { x: 1, y: 1 },
    size: { width: 1, height: 1 },
    layer: 'token',
    visible: true,
    controlledBy,
    rotation: 0,
    conditions: [],
    metadata: {},
    obscured,
  };
}

interface MoveEvent {
  tokenId: string;
  movedBy: string | null;
}

beforeAll(async () => {
  const [dm, owner, other] = await Promise.all(
    ['dm', 'owner', 'other'].map((name) =>
      prisma.user.create({
        data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Mover ${name}` },
      })
    )
  );
  dmId = dm.id;
  ownerId = owner.id;
  otherId = other.id;

  const campaign = await prisma.campaign.create({
    data: { name: `Obscured Mover ${runId}`, ownerId: dmId, vibeSettings: {} },
  });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: ownerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: otherId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });

  const map = await prisma.map.create({
    data: {
      campaignId,
      name: 'Mover Map',
      imageUrl: '/api/assets/maps/none',
      baseLayerUrl: '/api/assets/maps/none',
      width: 20,
      height: 20,
      tokens: [token(VEILED, ownerId, true), token(PLAIN, ownerId, false)],
      annotations: [],
    },
  });
  mapId = map.id;
  // Players are told of moves on the map the campaign is showing.
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });

  server = await createWsTestServer();
  [dmCookie, ownerCookie, otherCookie] = await Promise.all([
    server.loginAs(dmId),
    server.loginAs(ownerId),
    server.loginAs(otherId),
  ]);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, ownerId, otherId] } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.map.update({
    where: { id: mapId },
    data: { tokens: [token(VEILED, ownerId, true), token(PLAIN, ownerId, false)] },
  });
});

describe('the mover of an obscured token', () => {
  // The map id is only known once beforeAll has run, so each row carries just
  // the coordinates and the payload is built inside the test.
  it.each([
    ['token.move.start', 'token.move.start', {}],
    ['token.move', 'token.moved', { x: 4, y: 4 }],
    ['token.move.end', 'token.moved', { x: 5, y: 5 }],
  ])('is not named to another player by %s, and is to the DM', async (sent, received, coords) => {
    const owner = await server.connectAndAuth(ownerCookie, campaignId);
    const other = await server.connectAndAuth(otherCookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);

    const toOther = waitForEvent<MoveEvent>(other, received);
    const toDm = waitForEvent<MoveEvent>(dm, received);
    owner.emit(sent, { tokenId: VEILED, mapId, ...coords });

    const [seenByOther, seenByDm] = await Promise.all([toOther, toDm]);
    expect(seenByOther.movedBy).toBeNull();
    expect(seenByDm.movedBy).toBe(ownerId);

    owner.disconnect();
    other.disconnect();
    dm.disconnect();
  });

  it('is named to the mover\'s own other screens when the move is saved', async () => {
    const owner = await server.connectAndAuth(ownerCookie, campaignId);
    const ownerAgain = await server.connectAndAuth(ownerCookie, campaignId);

    const echoed = waitForEvent<MoveEvent>(ownerAgain, 'token.moved');
    owner.emit('token.move.end', { tokenId: VEILED, mapId, x: 6, y: 6 });
    expect((await echoed).movedBy).toBe(ownerId);

    owner.disconnect();
    ownerAgain.disconnect();
  });
});

describe('the mover of a plain token', () => {
  it('is named to everyone, as before', async () => {
    const owner = await server.connectAndAuth(ownerCookie, campaignId);
    const other = await server.connectAndAuth(otherCookie, campaignId);

    const toOther = waitForEvent<MoveEvent>(other, 'token.moved');
    owner.emit('token.move.end', { tokenId: PLAIN, mapId, x: 7, y: 7 });
    expect((await toOther).movedBy).toBe(ownerId);

    owner.disconnect();
    other.disconnect();
  });
});
