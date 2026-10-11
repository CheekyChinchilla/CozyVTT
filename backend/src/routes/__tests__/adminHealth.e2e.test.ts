/**
 * The Admin Panel's status card asks the server how it is.
 *
 * The card always said Healthy, with the API, database and live connections
 * all green, even when the page could not load its numbers because the
 * database was down. GET /api/admin/health checks each one.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { PlatformRole } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma as appPrisma } from '../../config/database';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer } from '../../__tests__/helpers/websocket-test-server';

const app = createTestApp();
let adminId: string;
let admin: request.Agent;

beforeAll(async () => {
  const user = await createTestUser({ role: PlatformRole.ADMIN, displayName: 'Health admin' });
  adminId = user.id;
  admin = request.agent(app);
  expect((await admin.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  try {
    await cleanupUsers([adminId]);
  } finally {
    await prisma.$disconnect();
  }
});

describe('GET /api/admin/health', () => {
  it('says each part is working, with the number of live connections', async () => {
    const ws = await createWsTestServer();
    try {
      const res = await admin.get('/api/admin/health');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'healthy', services: { api: 'ok', database: 'ok', websocket: 'ok' } });
      expect(typeof res.body.connections).toBe('number');
    } finally {
      await ws.close();
    }
  });

  it('says the database is down when it does not answer', async () => {
    jest.spyOn(appPrisma, '$queryRaw').mockRejectedValueOnce(new Error('connection refused'));

    const res = await admin.get('/api/admin/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.services.database).toBe('error');
  });
});
