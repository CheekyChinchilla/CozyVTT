/**
 * The MFA endpoints are actually rate limited.
 *
 * The limiter objects are unit-tested elsewhere; this pins that they are wired
 * to the live routes, which they were not before. `/mfa/verify` guesses a
 * six-digit code during enrolment and used to lean only on the blanket
 * 300/minute cap. A rejected attempt counts, so a burst of wrong codes is shut
 * off after five within the window.
 *
 * This file does not mock express-rate-limit (unlike auth.e2e), so the real
 * middleware runs. jest isolates modules per file, so the limiter's counter is
 * this file's alone.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
let userId: string;
let email: string;

beforeAll(async () => {
  const u = await createTestUser({ email: `mfa-rl-${Date.now()}@test.cozyvtt.local`, displayName: 'MFA RL' });
  userId = u.id;
  email = u.email;
});

afterAll(async () => {
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

it('stops repeated MFA verification attempts after five failures', async () => {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);

  // Five wrong codes are each rejected (400/401), and count against the budget.
  for (let i = 0; i < 5; i++) {
    const res = await agent.post('/api/auth/mfa/verify').send({ token: '000000' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(429);
  }

  // The sixth is refused by the limiter, not the handler.
  const blocked = await agent.post('/api/auth/mfa/verify').send({ token: '000000' });
  expect(blocked.status).toBe(429);
});
