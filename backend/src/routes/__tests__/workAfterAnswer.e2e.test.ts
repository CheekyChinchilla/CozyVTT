/**
 * Work a route starts after it has answered finishes before the end of the
 * test file lets the database go.
 *
 * A token change sends the map to the table again 100 ms later. A file whose
 * last request changed a token used to end before that re-send ran: the
 * re-send then opened a database connection inside an environment Jest had
 * already torn down, and the whole run failed for a file whose tests had all
 * passed.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { endTestFile } from '../../__tests__/helpers/testFileEnd';
import { prisma as appPrisma } from '../../config/database';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const app = createTestApp();

describe('the end of a test file, after a token change', () => {
  let dmId: string;
  let campaignId: string;
  let mapId: string;
  let dm: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const dmUser = await createTestUser({ displayName: 'Late Work DM' });
    dmId = dmUser.id;
    campaignId = (await createTestCampaign(dmId, { name: 'Late Work' })).id;
    await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
    mapId = (await prisma.map.create({
      data: {
        campaignId,
        name: 'Late Work Map',
        imageUrl: '/api/assets/maps/placeholder',
        baseLayerUrl: '/api/assets/maps/placeholder',
        width: 20,
        height: 20,
        gridSize: 50,
        tokens: [],
        annotations: [],
      },
    })).id;

    dm = request.agent(app);
    const res = await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId]);
  });

  it('lets the map re-send run first, and leaves nothing to run after it', async () => {
    // The re-send reads the map as it stands when it goes.
    const reads = jest.spyOn(appPrisma.map, 'findUnique');
    try {
      const res = await dm
        .post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`)
        .send({ name: 'Late', position: { x: 1, y: 1 }, type: 'player' });
      expect(res.status).toBe(201);
      const atTheAnswer = reads.mock.calls.length;

      await endTestFile();
      const atTheEnd = reads.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect({ beforeTheEnd: atTheEnd - atTheAnswer, afterTheEnd: reads.mock.calls.length - atTheEnd }).toEqual({ beforeTheEnd: 1, afterTheEnd: 0 });
    } finally {
      reads.mockRestore();
    }
  });
});
