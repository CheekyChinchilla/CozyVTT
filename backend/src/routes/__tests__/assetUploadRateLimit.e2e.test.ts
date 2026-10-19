/**
 * The upload limit stays on when ASSET_UPLOAD_RATE_LIMIT is not a number.
 *
 * The limit was read with parseInt, so a value such as `30/min` gave NaN and
 * the limiter let every upload through. It is read as the other limits are
 * now: a value that is not a whole number above zero is ignored, with a
 * warning, and the default of 30 a minute applies.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

process.env.ASSET_UPLOAD_RATE_LIMIT = 'thirty';

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
let userId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Upload Limit' });
  userId = user.id;
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
});

afterAll(async () => {
  delete process.env.ASSET_UPLOAD_RATE_LIMIT;
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

it('allows 30 uploads a minute and refuses the 31st', async () => {
  // Each is refused for having no file, after the limiter has counted it.
  for (let i = 0; i < 30; i += 1) {
    expect((await agent.post('/api/assets/upload')).status).not.toBe(429);
  }
  const refused = await agent.post('/api/assets/upload');
  expect(refused.status).toBe(429);
  expect(refused.body.message).toBe('Upload rate limit reached. Please slow down and try again in a minute.');
});
