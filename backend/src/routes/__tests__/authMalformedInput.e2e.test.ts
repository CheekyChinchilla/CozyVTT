/**
 * The sign-in routes refuse a field that is not text, and never answer with
 * the server's own error text.
 *
 * Forgot-password and reset-password checked only that the fields were
 * present, so a number or a list reached the database lookup or `toLowerCase`
 * and answered 500. Login checked only presence too, and its catch block sent
 * any error's message as a 400, so an email sent as an object answered
 * "input.email.toLowerCase is not a function", and a database failure during
 * sign-in or registration would have answered with the database's own words.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

// Every limiter lets the request through. The rest of the package stays
// real: the sign-in limiter keys an address with its ipKeyGenerator.
jest.mock('express-rate-limit', () => ({
  ...jest.requireActual<typeof import('express-rate-limit')>('express-rate-limit'),
  __esModule: true,
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// Registration is open here, so the register route reaches registerUser.
jest.mock('../../services/systemSettings', () => ({
  ...jest.requireActual('../../services/systemSettings'),
  getSystemSettings: jest.fn().mockResolvedValue({
    id: 'test-settings',
    setupCompleted: true,
    instanceName: 'CozyVTT Test',
    timezone: 'UTC',
    allowRegistration: true,
    requireAdminApproval: false,
  }),
}));

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma } from '../../__tests__/helpers/db';
import * as authService from '../../services/auth';

const app = createTestApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('login', () => {
  it.each([
    ['an object', { equals: 'someone@test.cozyvtt.local' }],
    ['a list', ['someone@test.cozyvtt.local']],
    ['a number', 42],
  ])('refuses an email sent as %s with 400 and no internal text', async (_label, value) => {
    const res = await request(app).post('/api/auth/login').send({ email: value, password: 'whatever' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
    expect(JSON.stringify(res.body)).not.toContain('toLowerCase');
  });

  it('refuses a rememberMe that is not true or false', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'whatever', rememberMe: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('answers a failure inside the server with a fixed message, not the error text', async () => {
    const spy = jest.spyOn(authService, 'authenticateUser').mockRejectedValueOnce(
      new Error('Invalid `prisma.user.findUnique()` invocation in /app/dist/services/auth.js:131: connection refused at db:5432')
    );
    try {
      const res = await request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'whatever' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal Server Error', message: 'An unexpected error occurred' });
    } finally {
      spy.mockRestore();
    }
  });
});

describe('register', () => {
  it('answers a failure inside the server with a fixed message, not the error text', async () => {
    const spy = jest.spyOn(authService, 'registerUser').mockRejectedValueOnce(
      new Error('Invalid `tx.user.create()` invocation in /app/dist/services/auth.js:109: index row size exceeds maximum')
    );
    try {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'brand-new@test.cozyvtt.local', password: 'AnotherGoodPass42!', displayName: 'New' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal Server Error', message: 'An unexpected error occurred' });
    } finally {
      spy.mockRestore();
    }
  });

  it('still explains a refused registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-address', password: 'AnotherGoodPass42!', displayName: 'New' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Registration Failed', message: 'Invalid email format' });
  });

  // The address was stored with < and > taken out, and sign-in looks it up as
  // typed, so the account could never be signed in to with what was typed.
  it('refuses an address holding < or >, and stores nothing', async () => {
    const stripped = { email: { in: ['jox@example.com', 'jo<x>@example.com'] } };
    try {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'jo<x>@example.com', password: 'AnotherGoodPass42!', displayName: 'Jo' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Registration Failed', message: 'Invalid email format' });
      expect(await prisma.user.count({ where: stripped })).toBe(0);
    } finally {
      await prisma.user.deleteMany({ where: stripped });
    }
  });
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
