/**
 * Forgot-password and reset-password refuse a field that is not text.
 *
 * Both checked only that the fields were present, so a number or a list
 * reached the database lookup or `toLowerCase` and answered 500.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('express-rate-limit', () => {
  return () => (_req: Request, _res: Response, next: NextFunction) => next();
});

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma } from '../../__tests__/helpers/db';

const app = createTestApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe.each([
  ['a number', 42],
  ['true', true],
  ['a list', ['someone@test.cozyvtt.local']],
  ['an object', { equals: 'someone@test.cozyvtt.local' }],
])('a field sent as %s', (_label, value) => {
  it('is refused by forgot-password with 400', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: value });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('is refused by reset-password with 400, as the token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: value, newPassword: 'AnotherGoodPass42!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('is refused by reset-password with 400, as the new password', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: '00000000-0000-0000-0000-000000000000', newPassword: value });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });
});
