/**
 * Reading an asset by its use on a token reads only the maps that name it.
 *
 * Whether a campaign uses an asset ends, when nothing cheaper has found it,
 * with the tokens on the maps the reader may see. Those were all loaded and
 * searched here, every map's tokens on every request for an asset the
 * campaign does not use. The database now narrows to the maps whose tokens
 * mention the id, and only those are read.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import { prisma as appPrisma } from '../../config/database';
import { canReadAsset } from '../permissions';

let dmId: string;
let ownerId: string;
let campaignId: string;
let usedId: string;
let unusedId: string;

beforeAll(async () => {
  const [dm, owner] = await Promise.all([createTestUser({ displayName: 'Scan DM' }), createTestUser({ displayName: 'Scan Owner' })]);
  dmId = dm.id;
  ownerId = owner.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Token scan' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: ownerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const art = (name: string) => prisma.asset.create({
    data: {
      type: 'TOKEN', scope: 'USER', uploadedById: ownerId, filename: 'x.png', originalName: 'x.png', mimeType: 'image/png',
      fileSize: 1, filePath: '/nonexistent/x.png', name,
    },
  }).then((a) => a.id);
  usedId = await art('On a token');
  unusedId = await art('On nothing');
  for (let i = 0; i < 5; i += 1) {
    await prisma.map.create({
      data: {
        campaignId, name: `Map ${i}`, imageUrl: '', baseLayerUrl: '', width: 10, height: 10, gridSize: 50, annotations: [],
        tokens: i === 3
          ? [{ id: 't', name: 'Ogre', imageUrl: `/api/assets/tokens/${usedId}`, position: { x: 0, y: 0 }, size: { width: 1, height: 1 } }]
          : [{ id: 't', name: 'Rat', imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } }],
      },
    });
  }
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: ownerId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, ownerId]);
  await prisma.$disconnect();
});

const facts = (id: string) => ({ id, scope: 'USER' as const, uploadedById: ownerId, campaignId: null });

it('grants the DM a picture a token on one of their maps uses', async () => {
  expect(await canReadAsset(facts(usedId), dmId, false)).toBe(true);
});

it('refuses one no token uses, without loading every map\'s tokens', async () => {
  const findMany = jest.spyOn(appPrisma.map, 'findMany');
  expect(await canReadAsset(facts(unusedId), dmId, false)).toBe(false);
  const tokenLoads = findMany.mock.calls.filter(([args]) => (args as { select?: { tokens?: boolean } } | undefined)?.select?.tokens);
  expect(tokenLoads).toEqual([]);
});
