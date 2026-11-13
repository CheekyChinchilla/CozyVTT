/**
 * Drawing on a map over the live table.
 *
 * The GM draws at any time; a player while Players may draw is on, except
 * while the session is paused or has ended; a spectator never. A drawing is
 * stored with its author taken from the connection, and a player's is for
 * everyone whatever they ask. One for the GM alone never reaches anyone
 * else: not when it is added, erased or cleared, not in the list a page
 * asks for, and not as a preview. A map's markup layer has two shares, the
 * GM's and the players' together, each holding 1,000 drawings and 100,000
 * points, counted under the map's lock, so drawings sent together cannot
 * pass either, and a player filling theirs never stops the GM drawing. A player erases only their own
 * drawings, at any time; a drawing they were never sent is answered as one
 * that does not exist. A prepared map's drawings are the GM's.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import type { AckAnswer } from '../ack';
import { applyRoleToLiveSockets } from '../utils';
import { DRAWING_LIMITS, DRAWING_OUTSIDE_MAP_MESSAGE, DRAWING_LAYER_REFUSAL, MARKUP_SHARE_FULL, CLEAR_MEMBER_REFUSAL } from '../../validators/drawings';
import {
  DRAW_PAUSED_REFUSAL, DRAW_SETTING_REFUSAL, DRAW_SPECTATOR_REFUSAL, ERASE_OTHERS_REFUSAL, ERASE_SPECTATOR_REFUSAL,
} from '../../utils/drawingRules';

jest.setTimeout(60000);

const runId = randomUUID().slice(0, 8);
let server: WsTestServer;
let campaignId: string;
let otherCampaignId: string;
let shownId: string;
let preparedId: string;
let foreignId: string;
const ids: Record<'gm' | 'p1' | 'p2' | 'spectator', string> = { gm: '', p1: '', p2: '', spectator: '' };
const cookies: Record<keyof typeof ids, string> = { gm: '', p1: '', p2: '', spectator: '' };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const line = (points: Array<[number, number]> = [[10, 10], [200, 120]]) => ({ kind: 'line', color: '#3d8bd9', width: 4, points });

/** Send an event with an acknowledgement, and the answer. */
function ask(client: ClientSocket, event: string, payload: unknown): Promise<AckAnswer> {
  return client.timeout(5000).emitWithAck(event, payload) as Promise<AckAnswer>;
}

/** The id an accepted add was answered with. */
function idOf(answer: AckAnswer): string {
  if (!answer.ok) throw new Error(`refused: ${answer.error}`);
  return String(answer.id);
}

/** The reason a refused request was answered with. */
const errorOf = (answer: AckAnswer): string | null => (answer.ok ? null : answer.error);

/** Everything `client` receives of `event` from now on. */
function collect<T = unknown>(client: ClientSocket, event: string): T[] {
  const seen: T[] = [];
  client.on(event, (data: T) => seen.push(data));
  return seen;
}

/** A drawing put straight into the table, as one made earlier. */
function stored(mapId: string, authorId: string | null, extra: Record<string, unknown> = {}) {
  return prisma.mapDrawing.create({
    data: { mapId, authorId, kind: 'line', color: '#e8a33c', width: 2, points: [[0, 0], [50, 50]], ...extra },
  });
}

type Seated = { gm: ClientSocket; p1: ClientSocket; p2: ClientSocket; spectator: ClientSocket };
async function seat(): Promise<Seated> {
  const [gm, p1, p2, spectator] = await Promise.all(
    (['gm', 'p1', 'p2', 'spectator'] as const).map((who) => server.connectAndAuth(cookies[who], campaignId))
  );
  return { gm, p1, p2, spectator };
}
function leave(table: Seated): void {
  for (const client of Object.values(table)) client.disconnect();
}

beforeAll(async () => {
  const users = await Promise.all(
    (Object.keys(ids) as Array<keyof typeof ids>).map((who) =>
      prisma.user.create({ data: { email: `drawings-${who}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Drawing ${who}` } })
    )
  );
  (Object.keys(ids) as Array<keyof typeof ids>).forEach((who, i) => { ids[who] = users[i].id; });
  campaignId = (await prisma.campaign.create({ data: { name: `Drawings ${runId}`, ownerId: ids.gm, vibeSettings: {}, status: 'ACTIVE' } })).id;
  otherCampaignId = (await prisma.campaign.create({ data: { name: `Drawings other ${runId}`, ownerId: ids.gm, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: ids.gm, campaignId, role: 'GM', characterIds: [] },
      { userId: ids.p1, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: ids.p2, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: ids.spectator, campaignId, role: 'SPECTATOR', characterIds: [] },
      { userId: ids.gm, campaignId: otherCampaignId, role: 'GM', characterIds: [] },
    ],
  });
  const map = (campaign: string, name: string) => ({
    campaignId: campaign, name, imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
    width: 10, height: 10, gridSize: 50, tokens: [], annotations: [],
  });
  shownId = (await prisma.map.create({ data: map(campaignId, 'Shown') })).id;
  preparedId = (await prisma.map.create({ data: map(campaignId, 'Prepared') })).id;
  foreignId = (await prisma.map.create({ data: map(otherCampaignId, 'Foreign') })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: shownId } });
  server = await createWsTestServer();
  for (const who of Object.keys(ids) as Array<keyof typeof ids>) cookies[who] = await server.loginAs(ids[who]);
});

beforeEach(async () => {
  await prisma.mapDrawing.deleteMany({ where: { mapId: { in: [shownId, preparedId, foreignId] } } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'ACTIVE', playersMayDraw: true } });
  // The flood ceilings are per user; a second apart, every case starts with its allowance.
  await sleep(1100);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.updateMany({ where: { id: { in: [campaignId, otherCampaignId] } }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId: { in: [campaignId, otherCampaignId] } } });
  await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, otherCampaignId] } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
  await prisma.$disconnect();
});

describe('drawing:add', () => {
  it('stores the GM\'s drawing, answers with its id, and sends it to everyone with the opId and previewId', async () => {
    const table = await seat();
    const heard = (['gm', 'p1', 'p2', 'spectator'] as const).map((who) => waitForEvent<Record<string, unknown>>(table[who], 'drawing:added'));
    const answer = await ask(table.gm, 'drawing:add', { mapId: shownId, drawing: line(), opId: 'op-1', previewId: 'stroke-1' });
    expect(answer).toEqual({ ok: true, id: expect.any(String), opId: 'op-1' });
    const id = idOf(answer);
    for (const event of await Promise.all(heard)) {
      expect(event).toEqual({
        mapId: shownId, opId: 'op-1', previewId: 'stroke-1',
        drawing: {
          id, authorId: ids.gm, audience: 'ALL', layer: 'MARKUP', kind: 'line', color: '#3d8bd9', fillColor: null,
          width: 4, rotation: 0, sortKey: 0, points: [[10, 10], [200, 120]], text: null, createdAt: expect.any(String),
        },
      });
    }
    const row = await prisma.mapDrawing.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ mapId: shownId, authorId: ids.gm, audience: 'ALL', layer: 'MARKUP' });
    leave(table);
  });

  it('sends a drawing for the GM alone to the GM\'s sockets and to nobody else', async () => {
    const table = await seat();
    const secondTab = await server.connectAndAuth(cookies.gm, campaignId);
    const nothing = (['p1', 'p2', 'spectator'] as const).map((who) => expectNoEvent(table[who], 'drawing:added', 800));
    const gmHears = waitForEvent<{ drawing: { audience: string } }>(secondTab, 'drawing:added');
    const answer = await ask(table.gm, 'drawing:add', { mapId: shownId, drawing: { ...line(), audience: 'GM' } });
    expect(answer.ok).toBe(true);
    expect((await gmHears).drawing.audience).toBe('GM');
    await Promise.all(nothing);
    leave(table);
    secondTab.disconnect();
  });

  it('stores a player\'s drawing as theirs and for everyone, whatever the payload says', async () => {
    const table = await seat();
    const p2Hears = waitForEvent<{ drawing: { authorId: string; audience: string } }>(table.p2, 'drawing:added');
    const answer = await ask(table.p1, 'drawing:add', {
      mapId: shownId, drawing: { ...line(), audience: 'GM', authorId: ids.p2, id: randomUUID() },
    });
    expect(answer.ok).toBe(true);
    expect((await p2Hears).drawing).toMatchObject({ authorId: ids.p1, audience: 'ALL' });
    const row = await prisma.mapDrawing.findUniqueOrThrow({ where: { id: idOf(answer) } });
    expect(row).toMatchObject({ authorId: ids.p1, audience: 'ALL' });
    leave(table);
  });

  it.each([
    ['PAUSED', true, DRAW_PAUSED_REFUSAL],
    ['INACTIVE', true, DRAW_PAUSED_REFUSAL],
    ['ACTIVE', false, DRAW_SETTING_REFUSAL],
  ])('refuses a player while the campaign is %s with Players may draw %s, and stores nothing', async (status, playersMayDraw, message) => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: status as 'PAUSED', playersMayDraw } });
    const table = await seat();
    const quiet = expectNoEvent(table.gm, 'drawing:added', 500);
    expect(await ask(table.p1, 'drawing:add', { mapId: shownId, drawing: line() })).toEqual({ ok: false, error: message });
    await quiet;
    expect(await prisma.mapDrawing.count({ where: { mapId: shownId } })).toBe(0);
    leave(table);
  });

  it.each(['PREPARATION', 'COMPLETED', 'ARCHIVED'])('lets a player draw while the campaign is %s, as they may move', async (status) => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: status as 'PREPARATION' } });
    const p1 = await server.connectAndAuth(cookies.p1, campaignId);
    expect((await ask(p1, 'drawing:add', { mapId: shownId, drawing: line() })).ok).toBe(true);
    p1.disconnect();
  });

  it('lets the GM draw while paused with Players may draw off', async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED', playersMayDraw: false } });
    const gm = await server.connectAndAuth(cookies.gm, campaignId);
    expect((await ask(gm, 'drawing:add', { mapId: shownId, drawing: line() })).ok).toBe(true);
    gm.disconnect();
  });

  it('refuses a spectator', async () => {
    const spectator = await server.connectAndAuth(cookies.spectator, campaignId);
    expect(await ask(spectator, 'drawing:add', { mapId: shownId, drawing: line() })).toEqual({ ok: false, error: DRAW_SPECTATOR_REFUSAL });
    expect(await prisma.mapDrawing.count({ where: { mapId: shownId } })).toBe(0);
    spectator.disconnect();
  });

  it('refuses with an error event when no acknowledgement is passed', async () => {
    const spectator = await server.connectAndAuth(cookies.spectator, campaignId);
    const refused = waitForEvent<{ message: string }>(spectator, 'error');
    spectator.emit('drawing:add', { mapId: shownId, drawing: line() });
    expect((await refused).message).toBe(DRAW_SPECTATOR_REFUSAL);
    spectator.disconnect();
  });

  it('answers a map of another campaign as one that does not exist', async () => {
    const gm = await server.connectAndAuth(cookies.gm, campaignId);
    expect(await ask(gm, 'drawing:add', { mapId: foreignId, drawing: line() })).toEqual({ ok: false, error: 'Map not found' });
    expect(await ask(gm, 'drawing:add', { mapId: 'not-a-map', drawing: line() })).toEqual({ ok: false, error: 'Map not found' });
    expect(await prisma.mapDrawing.count({ where: { mapId: foreignId } })).toBe(0);
    gm.disconnect();
  });

  it('refuses a player on a prepared map, and sends the GM\'s drawing there to the GM alone', async () => {
    const table = await seat();
    expect(await ask(table.p1, 'drawing:add', { mapId: preparedId, drawing: line() })).toEqual({ ok: false, error: 'Map not found' });
    const quiet = expectNoEvent(table.p1, 'drawing:added', 800);
    const gmHears = waitForEvent<{ mapId: string }>(table.gm, 'drawing:added');
    expect((await ask(table.gm, 'drawing:add', { mapId: preparedId, drawing: line() })).ok).toBe(true);
    expect((await gmHears).mapId).toBe(preparedId);
    await quiet;
    leave(table);
  });

  it('refuses points further outside the map than walls and lights may be', async () => {
    const gm = await server.connectAndAuth(cookies.gm, campaignId);
    // 10 squares of 50 pixels, and 500 squares of margin: 25,500 is the edge.
    expect((await ask(gm, 'drawing:add', { mapId: shownId, drawing: line([[0, 0], [25500, 0]]) })).ok).toBe(true);
    expect(await ask(gm, 'drawing:add', { mapId: shownId, drawing: line([[0, 0], [25501, 0]]) }))
      .toEqual({ ok: false, error: DRAWING_OUTSIDE_MAP_MESSAGE });
    gm.disconnect();
  });

  it('refuses a drawing the schema refuses, with its reason, and the ground layer', async () => {
    const gm = await server.connectAndAuth(cookies.gm, campaignId);
    expect(await ask(gm, 'drawing:add', { mapId: shownId, drawing: { ...line(), kind: 'polygon' } }))
      .toEqual({ ok: false, error: 'A polygon needs at least 3 corners' });
    expect(await ask(gm, 'drawing:add', { mapId: shownId, drawing: { ...line(), layer: 'GROUND' } }))
      .toEqual({ ok: false, error: DRAWING_LAYER_REFUSAL });
    expect(await ask(gm, 'drawing:add', { mapId: shownId })).toEqual({ ok: false, error: expect.any(String) });
    expect(await prisma.mapDrawing.count({ where: { mapId: shownId } })).toBe(0);
    gm.disconnect();
  });

  // Each map's markup layer has two shares with room of their own: the
  // GM's, and the players' together, so one player filling theirs never
  // stops the GM drawing. A drawing is in the GM's share when its author is
  // the campaign's GM as an add is counted, and in the players' otherwise.
  describe('what a map\'s markup layer holds', () => {
    const { GM: gmShare, PLAYERS: playersShare } = DRAWING_LIMITS.markupShares;
    const many = (n: number, authorId: string | null, extra: Record<string, unknown> = {}) =>
      prisma.mapDrawing.createMany({
        data: Array.from({ length: n }, () => ({ mapId: shownId, authorId, kind: 'line', color: '#1a1a1a', width: 1, points: [[0, 0], [1, 1]], ...extra })),
      });
    const stroke = (n: number) => Array.from({ length: n }, (_, i) => [i % 400, Math.floor(i / 400)]);

    it('refuses a player past the players\' share, counting every player\'s and neither the GM\'s nor another layer', async () => {
      await many(playersShare.drawings - 2, ids.p2);
      await many(1, null);
      await many(10, ids.gm);
      await many(5, ids.p2, { layer: 'GROUND' });
      const p1 = await server.connectAndAuth(cookies.p1, campaignId);
      expect((await ask(p1, 'drawing:add', { mapId: shownId, drawing: line() })).ok).toBe(true);
      expect(await ask(p1, 'drawing:add', { mapId: shownId, drawing: line() })).toEqual({ ok: false, error: MARKUP_SHARE_FULL.PLAYERS });
      p1.disconnect();
    });

    it('lets the GM draw while the players\' share is full, and a player while the GM\'s is', async () => {
      await many(playersShare.drawings, ids.p1);
      const gm = await server.connectAndAuth(cookies.gm, campaignId);
      expect((await ask(gm, 'drawing:add', { mapId: shownId, drawing: line() })).ok).toBe(true);
      await many(gmShare.drawings, ids.gm);
      expect(await ask(gm, 'drawing:add', { mapId: shownId, drawing: line() })).toEqual({ ok: false, error: MARKUP_SHARE_FULL.GM });
      gm.disconnect();

      await prisma.mapDrawing.deleteMany({ where: { mapId: shownId, authorId: ids.p1 } });
      const p1 = await server.connectAndAuth(cookies.p1, campaignId);
      expect((await ask(p1, 'drawing:add', { mapId: shownId, drawing: line() })).ok).toBe(true);
      p1.disconnect();
    });

    // A player filling theirs to learn what the GM holds is told the same
    // whatever the GM's share holds.
    it('tells a player nothing of the GM\'s drawings when the players\' share is full', async () => {
      await many(playersShare.drawings, ids.p2);
      const p1 = await server.connectAndAuth(cookies.p1, campaignId);
      const withNone = await ask(p1, 'drawing:add', { mapId: shownId, drawing: line() });
      await many(gmShare.drawings, ids.gm, { audience: 'GM' });
      const withAll = await ask(p1, 'drawing:add', { mapId: shownId, drawing: line() });
      expect(withAll).toEqual(withNone);
      expect(errorOf(withAll)).not.toMatch(/\d|GM/);
      p1.disconnect();
    });

    it('takes one drawing of several sent at once into the last place of a share', async () => {
      await many(gmShare.drawings - 1, ids.gm);
      const gm = await server.connectAndAuth(cookies.gm, campaignId);
      const answers = await Promise.all(Array.from({ length: 6 }, () => ask(gm, 'drawing:add', { mapId: shownId, drawing: line() })));
      expect(answers.filter((a) => a.ok)).toHaveLength(1);
      expect(answers.filter((a) => !a.ok).map(errorOf)).toEqual(Array(5).fill(MARKUP_SHARE_FULL.GM));
      expect(await prisma.mapDrawing.count({ where: { mapId: shownId, authorId: ids.gm } })).toBe(gmShare.drawings);
      gm.disconnect();
    });

    it('refuses a drawing past a share\'s points, counting no other share or layer', async () => {
      const strokes = gmShare.points / DRAWING_LIMITS.maxPoints;
      // Every stroke of the GM's share but one of 2,000 points, and one of
      // 1,998: two points short of its budget.
      await prisma.mapDrawing.createMany({
        data: [
          ...Array.from({ length: strokes - 1 }, () => ({ mapId: shownId, authorId: ids.gm, kind: 'pen', color: '#1a1a1a', width: 1, points: stroke(2000) })),
          { mapId: shownId, authorId: ids.gm, kind: 'pen', color: '#1a1a1a', width: 1, points: stroke(1998) },
          { mapId: shownId, authorId: ids.gm, kind: 'pen', color: '#1a1a1a', width: 1, points: stroke(2000), layer: 'GROUND' },
          ...Array.from({ length: strokes }, () => ({ mapId: shownId, authorId: ids.p2, kind: 'pen', color: '#1a1a1a', width: 1, points: stroke(2000) })),
        ],
      });
      const gm = await server.connectAndAuth(cookies.gm, campaignId);
      expect(await ask(gm, 'drawing:add', { mapId: shownId, drawing: { ...line(), kind: 'pen', points: [[1, 1], [2, 2], [3, 3]] } }))
        .toEqual({ ok: false, error: MARKUP_SHARE_FULL.GM });
      expect((await ask(gm, 'drawing:add', { mapId: shownId, drawing: line() })).ok).toBe(true);
      expect(await ask(gm, 'drawing:add', { mapId: shownId, drawing: { kind: 'text', color: '#1a1a1a', width: 4, points: [[5, 5]], text: 'x' } }))
        .toEqual({ ok: false, error: MARKUP_SHARE_FULL.GM });
      gm.disconnect();
      const p1 = await server.connectAndAuth(cookies.p1, campaignId);
      expect(await ask(p1, 'drawing:add', { mapId: shownId, drawing: line() })).toEqual({ ok: false, error: MARKUP_SHARE_FULL.PLAYERS });
      p1.disconnect();
    });

    // Counting the points reads every drawing's points whole, and the map's
    // lock is held meanwhile. Below the fewest drawings that could reach a
    // share's budget they are not counted; at the budget they are.
    it('answers an add at a share\'s budget well inside the time other writes to the map can wait', async () => {
      await prisma.mapDrawing.createMany({
        data: Array.from({ length: gmShare.points / DRAWING_LIMITS.maxPoints }, () => (
          { mapId: shownId, authorId: ids.gm, kind: 'pen', color: '#1a1a1a', width: 1, points: stroke(DRAWING_LIMITS.maxPoints) }
        )),
      });
      const gm = await server.connectAndAuth(cookies.gm, campaignId);
      const started = Date.now();
      expect(await ask(gm, 'drawing:add', { mapId: shownId, drawing: line() })).toEqual({ ok: false, error: MARKUP_SHARE_FULL.GM });
      expect(Date.now() - started).toBeLessThan(1000);
      gm.disconnect();
    });

    // The players' share holds only drawings a player is sent: every note
    // for the GM alone is the GM's, a former GM's and an authorless one too,
    // so a hand-over changes nothing a player can count.
    it('counts every drawing for the GM alone to the GM\'s share, whoever wrote it, before a hand-over and after', async () => {
      const seatTo = (userId: string, role: 'GM' | 'PLAYER') =>
        prisma.campaignMembership.update({ where: { userId_campaignId: { userId, campaignId } }, data: { role } });
      await many(playersShare.drawings - 10, ids.p1);
      await many(10, ids.gm, { audience: 'GM' });
      await many(5, null, { audience: 'GM' });
      const p1 = await server.connectAndAuth(cookies.p1, campaignId);
      await prisma.mapDrawing.delete({ where: { id: idOf(await ask(p1, 'drawing:add', { mapId: shownId, drawing: line() })) } });

      // The seat goes to p2, as PUT /api/campaigns/:id/gm hands it over.
      await seatTo(ids.gm, 'PLAYER');
      await seatTo(ids.p2, 'GM');
      try {
        expect((await ask(p1, 'drawing:add', { mapId: shownId, drawing: line() })).ok).toBe(true);
      } finally {
        await seatTo(ids.p2, 'PLAYER');
        await seatTo(ids.gm, 'GM');
        p1.disconnect();
      }
    });

    // An older version could leave a campaign with two GM rows: the shares
    // count by the one seated first, the same from one add to the next.
    it('counts by the GM seated first when a campaign has two GM rows', async () => {
      const where = { userId_campaignId: { userId: ids.p2, campaignId } };
      const { joinedAt } = await prisma.campaignMembership.findUniqueOrThrow({ where, select: { joinedAt: true } });
      await prisma.campaignMembership.update({ where, data: { role: 'GM', joinedAt: new Date('2020-01-01T00:00:00.000Z') } });
      try {
        await many(playersShare.drawings - 1, ids.p1);
        // The later GM's drawing for everyone: the players' share.
        await many(1, ids.gm);
        const p1 = await server.connectAndAuth(cookies.p1, campaignId);
        expect(await ask(p1, 'drawing:add', { mapId: shownId, drawing: line() })).toEqual({ ok: false, error: MARKUP_SHARE_FULL.PLAYERS });
        p1.disconnect();
      } finally {
        await prisma.campaignMembership.update({ where, data: { role: 'PLAYER', joinedAt } });
      }
    });

    it('says nothing of how many drawings a share holds', () => {
      for (const message of Object.values(MARKUP_SHARE_FULL)) expect(message).not.toMatch(/\d/);
    });
  });
});

describe('drawing:remove', () => {
  it('lets a player erase their own drawing, and tells everyone', async () => {
    const mine = await stored(shownId, ids.p1);
    const table = await seat();
    const heard = (['gm', 'p2', 'spectator'] as const).map((who) => waitForEvent(table[who], 'drawing:removed'));
    expect(await ask(table.p1, 'drawing:remove', { mapId: shownId, drawingId: mine.id, opId: 'erase-1' })).toEqual({ ok: true, opId: 'erase-1' });
    for (const event of await Promise.all(heard)) expect(event).toEqual({ mapId: shownId, drawingId: mine.id, opId: 'erase-1' });
    expect(await prisma.mapDrawing.findUnique({ where: { id: mine.id } })).toBeNull();
    leave(table);
  });

  it('lets a player erase their own while paused with Players may draw off', async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED', playersMayDraw: false } });
    const mine = await stored(shownId, ids.p1);
    const p1 = await server.connectAndAuth(cookies.p1, campaignId);
    expect((await ask(p1, 'drawing:remove', { mapId: shownId, drawingId: mine.id })).ok).toBe(true);
    p1.disconnect();
  });

  it('refuses a player another player\'s drawing, and the GM\'s, and one whose author is gone', async () => {
    const theirs = await stored(shownId, ids.p2);
    const gms = await stored(shownId, ids.gm);
    const orphan = await stored(shownId, null);
    const p1 = await server.connectAndAuth(cookies.p1, campaignId);
    for (const drawing of [theirs, gms, orphan]) {
      expect(await ask(p1, 'drawing:remove', { mapId: shownId, drawingId: drawing.id })).toEqual({ ok: false, error: ERASE_OTHERS_REFUSAL });
    }
    expect(await prisma.mapDrawing.count({ where: { mapId: shownId } })).toBe(3);
    p1.disconnect();
  });

  it('answers a player about a drawing for the GM alone as about one that does not exist', async () => {
    const secret = await stored(shownId, ids.gm, { audience: 'GM' });
    const p1 = await server.connectAndAuth(cookies.p1, campaignId);
    const unknown = await ask(p1, 'drawing:remove', { mapId: shownId, drawingId: randomUUID() });
    const hidden = await ask(p1, 'drawing:remove', { mapId: shownId, drawingId: secret.id });
    expect(unknown).toEqual({ ok: false, error: 'Drawing not found' });
    expect(hidden).toEqual(unknown);
    expect(await prisma.mapDrawing.findUnique({ where: { id: secret.id } })).not.toBeNull();
    p1.disconnect();
  });

  it('answers a drawing named on another map as one that does not exist', async () => {
    const elsewhere = await stored(preparedId, ids.gm);
    const gm = await server.connectAndAuth(cookies.gm, campaignId);
    expect(await ask(gm, 'drawing:remove', { mapId: shownId, drawingId: elsewhere.id })).toEqual({ ok: false, error: 'Drawing not found' });
    expect(await prisma.mapDrawing.findUnique({ where: { id: elsewhere.id } })).not.toBeNull();
    gm.disconnect();
  });

  it('lets the GM erase any drawing, and tells only the GM of one for the GM alone', async () => {
    const secret = await stored(shownId, ids.gm, { audience: 'GM' });
    const orphan = await stored(shownId, null);
    const table = await seat();
    const quiet = expectNoEvent(table.p1, 'drawing:removed', 600);
    expect((await ask(table.gm, 'drawing:remove', { mapId: shownId, drawingId: secret.id })).ok).toBe(true);
    await quiet;
    const told = waitForEvent(table.p1, 'drawing:removed');
    expect((await ask(table.gm, 'drawing:remove', { mapId: shownId, drawingId: orphan.id })).ok).toBe(true);
    await told;
    expect(await prisma.mapDrawing.count({ where: { mapId: shownId } })).toBe(0);
    leave(table);
  });

  it('refuses a spectator, a drawing of their own from before a demotion included', async () => {
    const before = await stored(shownId, ids.spectator);
    const spectator = await server.connectAndAuth(cookies.spectator, campaignId);
    expect(await ask(spectator, 'drawing:remove', { mapId: shownId, drawingId: before.id })).toEqual({ ok: false, error: ERASE_SPECTATOR_REFUSAL });
    expect(await prisma.mapDrawing.findUnique({ where: { id: before.id } })).not.toBeNull();
    spectator.disconnect();
  });

  it('refuses a player on a prepared map', async () => {
    const mine = await stored(preparedId, ids.p1);
    const p1 = await server.connectAndAuth(cookies.p1, campaignId);
    expect(await ask(p1, 'drawing:remove', { mapId: preparedId, drawingId: mine.id })).toEqual({ ok: false, error: 'Map not found' });
    p1.disconnect();
  });
});

describe('drawing:clear_mine', () => {
  it('erases the sender\'s drawings on the markup layer, and only theirs', async () => {
    await stored(shownId, ids.p1);
    await stored(shownId, ids.p1);
    const theirs = await stored(shownId, ids.p2);
    const table = await seat();
    const heard = waitForEvent(table.gm, 'drawings:cleared');
    expect(await ask(table.p1, 'drawing:clear_mine', { mapId: shownId, opId: 'mine-1' })).toEqual({ ok: true, opId: 'mine-1' });
    expect(await heard).toEqual({ mapId: shownId, layer: 'MARKUP', authorId: ids.p1, opId: 'mine-1' });
    expect((await prisma.mapDrawing.findMany({ where: { mapId: shownId } })).map((d) => d.id)).toEqual([theirs.id]);
    leave(table);
  });

  it('works while paused with Players may draw off', async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'PAUSED', playersMayDraw: false } });
    await stored(shownId, ids.p1);
    const p1 = await server.connectAndAuth(cookies.p1, campaignId);
    expect((await ask(p1, 'drawing:clear_mine', { mapId: shownId })).ok).toBe(true);
    expect(await prisma.mapDrawing.count({ where: { mapId: shownId } })).toBe(0);
    p1.disconnect();
  });

  it('refuses a spectator', async () => {
    await stored(shownId, ids.spectator);
    const spectator = await server.connectAndAuth(cookies.spectator, campaignId);
    expect(await ask(spectator, 'drawing:clear_mine', { mapId: shownId })).toEqual({ ok: false, error: ERASE_SPECTATOR_REFUSAL });
    expect(await prisma.mapDrawing.count({ where: { mapId: shownId } })).toBe(1);
    spectator.disconnect();
  });

  it('tells nobody when there was nothing to clear', async () => {
    const table = await seat();
    const quiet = expectNoEvent(table.gm, 'drawings:cleared', 600);
    expect((await ask(table.p1, 'drawing:clear_mine', { mapId: shownId })).ok).toBe(true);
    await quiet;
    leave(table);
  });
});

// The GM's seat moves: the owner or an administrator may take it. A GM who
// leaves it is a player who wrote drawings for the GM alone, which they are
// no longer sent; they may erase none of them, one at a time or all at once.
describe('a GM who has left the seat', () => {
  const asRole = (userId: string, role: 'GM' | 'PLAYER') =>
    prisma.campaignMembership.update({ where: { userId_campaignId: { userId, campaignId } }, data: { role } });

  it('may not erase or clear the drawings for the GM alone they wrote, and remove and clear mine agree', async () => {
    // p1 holds the seat and writes a note for the GM alone and one for everyone.
    await asRole(ids.gm, 'PLAYER');
    await asRole(ids.p1, 'GM');
    let secretId: string;
    let sharedId: string;
    try {
      const seated = await server.connectAndAuth(cookies.p1, campaignId);
      secretId = idOf(await ask(seated, 'drawing:add', { mapId: shownId, drawing: { ...line(), audience: 'GM' } }));
      sharedId = idOf(await ask(seated, 'drawing:add', { mapId: shownId, drawing: line() }));
      seated.disconnect();
    } finally {
      // The seat goes back.
      await asRole(ids.p1, 'PLAYER');
      await asRole(ids.gm, 'GM');
    }
    const p1 = await server.connectAndAuth(cookies.p1, campaignId);
    expect(await ask(p1, 'drawing:remove', { mapId: shownId, drawingId: secretId })).toEqual({ ok: false, error: 'Drawing not found' });
    expect((await ask(p1, 'drawing:clear_mine', { mapId: shownId })).ok).toBe(true);
    expect(await prisma.mapDrawing.findUnique({ where: { id: secretId } })).not.toBeNull();
    expect(await prisma.mapDrawing.findUnique({ where: { id: sharedId } })).toBeNull();
    p1.disconnect();
  });
});

describe('drawing:clear', () => {
  it('erases every drawing on the markup layer for the GM, and tells everyone', async () => {
    await stored(shownId, ids.p1);
    await stored(shownId, ids.gm, { audience: 'GM' });
    const ground = await stored(shownId, ids.gm, { layer: 'GROUND' });
    const table = await seat();
    const heard = (['p1', 'spectator'] as const).map((who) => waitForEvent(table[who], 'drawings:cleared'));
    expect(await ask(table.gm, 'drawing:clear', { mapId: shownId, layer: 'MARKUP', opId: 'clear-1' })).toEqual({ ok: true, opId: 'clear-1' });
    for (const event of await Promise.all(heard)) expect(event).toEqual({ mapId: shownId, layer: 'MARKUP', opId: 'clear-1' });
    expect((await prisma.mapDrawing.findMany({ where: { mapId: shownId } })).map((d) => d.id)).toEqual([ground.id]);
    leave(table);
  });

  it('tells only the GM when every drawing cleared was for the GM alone', async () => {
    await stored(shownId, ids.gm, { audience: 'GM' });
    const table = await seat();
    const quiet = expectNoEvent(table.p1, 'drawings:cleared', 600);
    const gmHears = waitForEvent(table.gm, 'drawings:cleared');
    expect((await ask(table.gm, 'drawing:clear', { mapId: shownId, layer: 'MARKUP' })).ok).toBe(true);
    await gmHears;
    await quiet;
    leave(table);
  });

  it('refuses a player, and the ground layer', async () => {
    await stored(shownId, ids.p1);
    const table = await seat();
    expect(await ask(table.p1, 'drawing:clear', { mapId: shownId, layer: 'MARKUP' })).toEqual({ ok: false, error: 'Only the GM can clear the drawings' });
    expect(await ask(table.gm, 'drawing:clear', { mapId: shownId, layer: 'GROUND' })).toEqual({ ok: false, error: DRAWING_LAYER_REFUSAL });
    expect(await prisma.mapDrawing.count({ where: { mapId: shownId } })).toBe(1);
    leave(table);
  });
});

// The GM tidies up after one player without losing anyone else's work. A
// drawing for the GM alone that player wrote in the GM's seat stays, as it
// does from their own Clear mine: it goes with the seat.
describe('drawing:clear naming one member', () => {
  // Five clears every ten seconds from one user: this describe starts with
  // the GM's whole allowance, and uses four.
  beforeAll(() => sleep(10100));

  it('erases one member\'s drawings for everyone when it names them, and nobody else\'s', async () => {
    const theirs = [await stored(shownId, ids.p1), await stored(shownId, ids.p1)];
    const fromTheSeat = await stored(shownId, ids.p1, { audience: 'GM' });
    const others = [await stored(shownId, ids.p2), await stored(shownId, ids.gm), await stored(shownId, null)];
    const table = await seat();
    const heard = (['gm', 'p1', 'p2', 'spectator'] as const).map((who) => waitForEvent(table[who], 'drawings:cleared'));
    expect(await ask(table.gm, 'drawing:clear', { mapId: shownId, layer: 'MARKUP', authorId: ids.p1, opId: 'clear-p1' }))
      .toEqual({ ok: true, opId: 'clear-p1' });
    for (const event of await Promise.all(heard)) expect(event).toEqual({ mapId: shownId, layer: 'MARKUP', authorId: ids.p1, opId: 'clear-p1' });
    const left = (await prisma.mapDrawing.findMany({ where: { mapId: shownId } })).map((d) => d.id);
    expect(left.sort()).toEqual([fromTheSeat.id, ...others.map((d) => d.id)].sort());
    expect(left).not.toContain(theirs[0].id);
    leave(table);
  });

  it('erases every drawing of the GM\'s own when it names the GM, those for the GM alone too', async () => {
    await stored(shownId, ids.gm);
    await stored(shownId, ids.gm, { audience: 'GM' });
    const mara = await stored(shownId, ids.p1);
    const table = await seat();
    expect((await ask(table.gm, 'drawing:clear', { mapId: shownId, layer: 'MARKUP', authorId: ids.gm })).ok).toBe(true);
    expect((await prisma.mapDrawing.findMany({ where: { mapId: shownId } })).map((d) => d.id)).toEqual([mara.id]);
    leave(table);
  });

  it('erases nothing, and tells nobody, for someone with no drawing on the map, and refuses what is not an id', async () => {
    await stored(shownId, ids.p1);
    const table = await seat();
    const quiet = expectNoEvent(table.p1, 'drawings:cleared', 600);
    expect(await ask(table.gm, 'drawing:clear', { mapId: shownId, layer: 'MARKUP', authorId: randomUUID() })).toEqual({ ok: true });
    expect(await ask(table.gm, 'drawing:clear', { mapId: shownId, layer: 'MARKUP', authorId: 'mara' })).toEqual({ ok: false, error: CLEAR_MEMBER_REFUSAL });
    await quiet;
    expect(await prisma.mapDrawing.count({ where: { mapId: shownId } })).toBe(1);
    leave(table);
  });

  it('refuses a player who names a member, as any clear', async () => {
    await stored(shownId, ids.p2);
    const table = await seat();
    expect(await ask(table.p1, 'drawing:clear', { mapId: shownId, layer: 'MARKUP', authorId: ids.p2 })).toEqual({ ok: false, error: 'Only the GM can clear the drawings' });
    expect(await prisma.mapDrawing.count({ where: { mapId: shownId } })).toBe(1);
    leave(table);
  });

});

describe('drawings:request', () => {
  it('answers the GM with every drawing and a player with those for everyone, in drawing order', async () => {
    const late = await stored(shownId, ids.p1, { sortKey: 5 });
    const first = await stored(shownId, ids.gm, { sortKey: -3 });
    const secret = await stored(shownId, ids.gm, { audience: 'GM' });
    const plain = await stored(shownId, ids.p2);
    const table = await seat();
    const gmState = waitForEvent<{ mapId: string; drawings: Array<{ id: string }> }>(table.gm, 'drawings:state');
    const playerState = waitForEvent<{ mapId: string; drawings: Array<{ id: string }> }>(table.p1, 'drawings:state');
    table.gm.emit('drawings:request', { mapId: shownId });
    table.p1.emit('drawings:request', { mapId: shownId });
    expect((await gmState).drawings.map((d) => d.id)).toEqual([first.id, secret.id, plain.id, late.id]);
    expect((await playerState).drawings.map((d) => d.id)).toEqual([first.id, plain.id, late.id]);
    leave(table);
  });

  // A GM demoted while the list is read is sent what their new role may have.
  it('answers by the role the sender has when the answer is sent', async () => {
    await stored(shownId, ids.gm, { audience: 'GM' });
    const shared = await stored(shownId, ids.p1);
    const gm = await server.connectAndAuth(cookies.gm, campaignId);
    const findMany = prisma.mapDrawing.findMany.bind(prisma.mapDrawing);
    const read = jest.spyOn(prisma.mapDrawing, 'findMany').mockImplementationOnce(((args: never) =>
      findMany(args).then(async (found) => {
        await applyRoleToLiveSockets(ids.gm, campaignId, 'PLAYER');
        return found;
      })) as never);
    try {
      const state = waitForEvent<{ drawings: Array<{ id: string }> }>(gm, 'drawings:state');
      gm.emit('drawings:request', { mapId: shownId });
      expect((await state).drawings.map((d) => d.id)).toEqual([shared.id]);
    } finally {
      read.mockRestore();
      gm.disconnect();
    }
  });

  it('answers a player nothing about a prepared map or another campaign\'s, and the GM about a prepared one', async () => {
    await stored(preparedId, ids.gm);
    const table = await seat();
    const silence = expectNoEvent(table.p1, 'drawings:state', 600);
    table.p1.emit('drawings:request', { mapId: preparedId });
    table.p1.emit('drawings:request', { mapId: foreignId });
    await silence;
    const gmState = waitForEvent<{ mapId: string; drawings: unknown[] }>(table.gm, 'drawings:state');
    table.gm.emit('drawings:request', { mapId: preparedId });
    expect((await gmState).drawings).toHaveLength(1);
    leave(table);
  });
});

describe('drawing:preview', () => {
  const frame = (extra: Record<string, unknown> = {}) => ({
    previewId: 'stroke-9', kind: 'pen', color: '#d94f3d', width: 3, points: [[1, 1], [4, 6]], ...extra,
  });

  it('sends a player\'s frame to everyone else on the map, for everyone, with who drew it', async () => {
    const table = await seat();
    const heard = (['gm', 'p2', 'spectator'] as const).map((who) => waitForEvent(table[who], 'drawing:previewed'));
    const notBack = expectNoEvent(table.p1, 'drawing:previewed', 600);
    table.p1.emit('drawing:preview', { mapId: shownId, preview: frame({ audience: 'GM' }) });
    for (const event of await Promise.all(heard)) {
      expect(event).toEqual({
        mapId: shownId, userId: ids.p1,
        preview: { previewId: 'stroke-9', kind: 'pen', color: '#d94f3d', width: 3, audience: 'ALL', laser: false, points: [[1, 1], [4, 6]], end: false },
      });
    }
    await notBack;
    leave(table);
  });

  it('sends the GM\'s frame for the GM alone to the GM\'s other sockets only, and the laser pointer to everyone', async () => {
    const table = await seat();
    const secondTab = await server.connectAndAuth(cookies.gm, campaignId);
    const quiet = expectNoEvent(table.p1, 'drawing:previewed', 600);
    const gmHears = waitForEvent(secondTab, 'drawing:previewed');
    table.gm.emit('drawing:preview', { mapId: shownId, preview: frame({ audience: 'GM' }) });
    await gmHears;
    await quiet;
    const laser = waitForEvent<{ preview: { laser: boolean; audience: string } }>(table.p1, 'drawing:previewed');
    table.gm.emit('drawing:preview', { mapId: shownId, preview: frame({ previewId: 'laser-1', audience: 'GM', laser: true }) });
    expect((await laser).preview).toMatchObject({ laser: true, audience: 'ALL' });
    leave(table);
    secondTab.disconnect();
  });

  it.each([
    ['a spectator', 'spectator', 'ACTIVE', true],
    ['a player while paused', 'p1', 'PAUSED', true],
    ['a player with Players may draw off', 'p1', 'ACTIVE', false],
  ] as const)('drops a frame from %s without a word', async (_what, who, status, playersMayDraw) => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status, playersMayDraw } });
    const table = await seat();
    const quiet = expectNoEvent(table.gm, 'drawing:previewed', 600);
    const noError = expectNoEvent(table[who], 'error', 600);
    table[who].emit('drawing:preview', { mapId: shownId, preview: frame() });
    await quiet;
    await noError;
    leave(table);
  });

  it('drops a player\'s frame on a prepared map, and sends the GM\'s there to the GM alone', async () => {
    const table = await seat();
    const secondTab = await server.connectAndAuth(cookies.gm, campaignId);
    const quietGm = expectNoEvent(secondTab, 'drawing:previewed', 600);
    table.p1.emit('drawing:preview', { mapId: preparedId, preview: frame() });
    await quietGm;
    const quietPlayer = expectNoEvent(table.p1, 'drawing:previewed', 600);
    const gmHears = waitForEvent<{ mapId: string }>(secondTab, 'drawing:previewed');
    table.gm.emit('drawing:preview', { mapId: preparedId, preview: frame({ previewId: 'prep-1' }) });
    expect((await gmHears).mapId).toBe(preparedId);
    await quietPlayer;
    leave(table);
    secondTab.disconnect();
  });

  it('drops a frame with more new points than a frame carries', async () => {
    const table = await seat();
    const quiet = expectNoEvent(table.gm, 'drawing:previewed', 600);
    table.p1.emit('drawing:preview', { mapId: shownId, preview: frame({ points: Array.from({ length: DRAWING_LIMITS.maxPreviewPoints + 1 }, () => [1, 1]) }) });
    await quiet;
    leave(table);
  });

  it('passes on at most 60 frames a second from one user, and says nothing of the rest', async () => {
    const table = await seat();
    const heard = collect(table.gm, 'drawing:previewed');
    const noError = expectNoEvent(table.p1, 'error', 1500);
    for (let i = 0; i < 100; i += 1) table.p1.emit('drawing:preview', { mapId: shownId, preview: frame({ points: [[i, i]] }) });
    await noError;
    expect(heard.length).toBe(60);
    leave(table);
  });

  it('stops passing on a stroke once Players may draw has been off for a second', async () => {
    const table = await seat();
    const heard = collect(table.gm, 'drawing:previewed');
    table.p1.emit('drawing:preview', { mapId: shownId, preview: frame() });
    await sleep(300);
    expect(heard).toHaveLength(1);
    await prisma.campaign.update({ where: { id: campaignId }, data: { playersMayDraw: false } });
    await sleep(1100);
    table.p1.emit('drawing:preview', { mapId: shownId, preview: frame({ points: [[9, 9]] }) });
    await sleep(500);
    expect(heard).toHaveLength(1);
    leave(table);
  });
});
