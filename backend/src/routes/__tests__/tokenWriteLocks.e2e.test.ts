/**
 * Every write to a map's tokens waits for the map's lock.
 *
 * A map's tokens are one JSON list, and every write reads it, changes it and
 * writes the whole list back. The token routes and the drop of a drag take
 * an advisory lock on the map first (withMapsLocked). Four other writers did
 * not, so one of them landing while a locked writer held the list put its
 * own copy back over the locked writer's, or had its own change written
 * away: revealing a token from the Spirit Layer panel, setting or rolling
 * initiative, and a character's new picture reaching its tokens.
 *
 * Each case here holds the lock itself, reads the list, lets the writer run,
 * then adds a token and commits. A writer that waits for the lock sees that
 * token and keeps it, and its own change survives; one that does not is
 * written away.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { withMapsLocked } from '../../utils/mapTokens';
import { readTokens, toJson } from '../../utils/prisma-json';
import { clearState } from '../../websocket/initiativeState';

jest.setTimeout(30000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let characterId: string;
let assetId: string;
let dm: ClientSocket;
let player: ReturnType<typeof request.agent>;

const GHOST = randomUUID();
const HERO = randomUUID();
const token = (id: string, extra: Record<string, unknown>) => ({
  id, name: id, imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token',
  visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {}, ...extra,
});

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `locks-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `locks-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Locks ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  characterId = (await prisma.character.create({
    data: { userId: playerId, campaignId, name: 'Hero', gameSystem: 'DND_5E', data: {} },
  })).id;
  assetId = (await prisma.asset.create({
    data: {
      type: 'TOKEN', scope: 'USER', uploadedById: playerId, filename: 'hero.png', originalName: 'hero.png',
      mimeType: 'image/png', fileSize: 1, filePath: '/nonexistent/hero.png', name: 'hero',
    },
  })).id;
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Locked', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 10, height: 10, gridSize: 50, annotations: [], tokens: [],
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  player = request.agent(app);
  expect((await player.post('/api/auth/login').send({ email: playerUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

beforeEach(async () => {
  await prisma.map.update({
    where: { id: mapId },
    data: {
      tokens: toJson([
        token(GHOST, { layer: 'spirit', visible: false }),
        token(HERO, { characterId, controlledBy: playerId, type: 'player' }),
      ]),
    },
  });
  await prisma.character.update({ where: { id: characterId }, data: { tokenImageUrl: null } });
  clearState(campaignId);
  dm = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
});

afterEach(() => dm.disconnect());

afterAll(async () => {
  await server.close();
  clearState(campaignId);
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.character.deleteMany({ where: { id: characterId } });
  await prisma.asset.deleteMany({ where: { id: assetId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

/**
 * Hold the map's lock while `write` runs: read the list, give the writer
 * time to act, then add a token and commit. Returns the list as it ends up.
 */
async function raceAgainstLockedAdd(write: () => Promise<unknown> | void) {
  const added = randomUUID();
  let started!: () => void;
  const holding = new Promise<void>((resolve) => { started = resolve; });
  const holder = withMapsLocked([mapId], async (tx) => {
    const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    started();
    await new Promise((resolve) => setTimeout(resolve, 700));
    await tx.map.update({ where: { id: mapId }, data: { tokens: toJson([...readTokens(fresh.tokens), token(added, {})]) } });
  });
  await holding;
  const writing = Promise.resolve(write());
  await holder;
  await writing;
  // A writer that waited for the lock finishes just after it is released.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const tokens = readTokens((await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } })).tokens);
  return { tokens, added };
}

const find = (tokens: ReturnType<typeof readTokens>, id: string) => tokens.find((t) => t.id === id);

describe('a write to the tokens that lands while the map is locked', () => {
  it('revealing a spirit token keeps the other write and its own', async () => {
    const { tokens, added } = await raceAgainstLockedAdd(() => {
      dm.emit('spirit_layer.token.toggle', { mapId, tokenId: GHOST, visible: true });
    });
    expect(find(tokens, added)).toBeDefined();
    expect(find(tokens, GHOST)?.visible).toBe(true);
  });

  it('setting initiative keeps the other write and its own', async () => {
    const { tokens, added } = await raceAgainstLockedAdd(() => {
      dm.emit('initiative.set', { tokenId: HERO, mapId, value: 17 });
    });
    expect(find(tokens, added)).toBeDefined();
    expect(find(tokens, HERO)?.initiative).toBe(17);
  });

  it('rolling initiative keeps the other write and its own', async () => {
    const { tokens, added } = await raceAgainstLockedAdd(() => {
      dm.emit('initiative.roll', { tokenId: HERO, mapId });
    });
    expect(find(tokens, added)).toBeDefined();
    // The roll itself comes from the character's sheet; what matters is
    // that it was stored.
    expect(typeof find(tokens, HERO)?.initiative).toBe('number');
  });

  it("a character's new picture keeps the other write and reaches its token", async () => {
    const { tokens, added } = await raceAgainstLockedAdd(() =>
      player.put(`/api/characters/${characterId}`).send({ tokenImageUrl: `/api/assets/tokens/${assetId}` })
    );
    expect(find(tokens, added)).toBeDefined();
    expect(find(tokens, HERO)?.imageUrl).toBe(`/api/assets/tokens/${assetId}`);
  });
});
