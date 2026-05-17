/**
 * Auth Routes — Integration Tests
 *
 * Tests the HTTP layer: register, login, logout, /me, /ping.
 * Uses Supertest against the test app (memory session, no setup gate).
 * Uses real Prisma against the dev/test database.
 *
 * Rate limiter is mocked out so tests can exceed 5 requests freely.
 */

// Mock rate limiter before any imports that load the auth router
jest.mock('express-rate-limit', () => {
  return () => (_req: any, _res: any, next: any) => next();
});

// Mock system settings so the register route behaves predictably
jest.mock('../../services/systemSettings', () => ({
  getSystemSettings: jest.fn().mockResolvedValue({
    id: 'test-settings',
    setupCompleted: true,
    instanceName: 'CozyVTT Test',
    timezone: 'UTC',
    allowRegistration: true,
    requireAdminApproval: false,
  }),
  isSetupCompleted: jest.fn().mockResolvedValue(true),
  updateSystemSettings: jest.fn(),
  markSetupCompleted: jest.fn(),
  hasUsers: jest.fn().mockResolvedValue(true),
}));

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import {
  prisma,
  createTestUser,
  cleanupUsers,
  testEmail,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const app = createTestApp();

// ============================================
// GET /health — Sanity check
// ============================================

describe('GET /health', () => {
  it('returns 200 with healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });
});

// ============================================
// POST /api/auth/register
// ============================================

describe('POST /api/auth/register', () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    await cleanupUsers(createdIds);
  });

  it('registers a new user and returns 201', async () => {
    const email = testEmail('register');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: TEST_PASSWORD, displayName: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.passwordHash).toBeUndefined(); // must be sanitized
    expect(res.body.user.mfaSecret).toBeUndefined();

    createdIds.push(res.body.user.id);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ password: TEST_PASSWORD, displayName: 'No Email' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail('nopw'), displayName: 'No Password' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when displayName is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail('noname'), password: TEST_PASSWORD });

    expect(res.status).toBe(400);
  });

  it('returns 400 for a duplicate email', async () => {
    const email = testEmail('duplicate');

    const first = await request(app)
      .post('/api/auth/register')
      .send({ email, password: TEST_PASSWORD, displayName: 'First' });
    expect(first.status).toBe(201);
    createdIds.push(first.body.user.id);

    const second = await request(app)
      .post('/api/auth/register')
      .send({ email, password: TEST_PASSWORD, displayName: 'Second' });
    expect(second.status).toBe(400);
  });

  it('returns 400 for a weak password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail('weakpw'), password: 'weak', displayName: 'Weak' });

    expect(res.status).toBe(400);
  });
});

// ============================================
// POST /api/auth/login
// ============================================

describe('POST /api/auth/login', () => {
  let userId: string;
  let userEmail: string;

  beforeAll(async () => {
    const user = await createTestUser({ displayName: 'Login Test User' });
    userId = user.id;
    userEmail = user.email;
  });

  afterAll(async () => {
    await cleanupUsers([userId]);
  });

  it('returns 200 and user data for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: userEmail, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(userEmail);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.message).toBe('Login successful');
  });

  it('sets a session cookie on successful login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: userEmail, password: TEST_PASSWORD });

    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: userEmail, password: 'WrongPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication Failed');
  });

  it('returns 401 for unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail('nonexistent'), password: TEST_PASSWORD });

    expect(res.status).toBe(401);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: TEST_PASSWORD });

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: userEmail });

    expect(res.status).toBe(400);
  });

  it('returns 403 for an account pending approval', async () => {
    const pendingUser = await createTestUser({
      isApproved: false,
      displayName: 'Pending User',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: pendingUser.email, password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Account Pending Approval');

    await cleanupUsers([pendingUser.id]);
  });
});

// ============================================
// POST /api/auth/logout
// ============================================

describe('POST /api/auth/logout', () => {
  it('returns 200 and destroys the session', async () => {
    const agent = request.agent(app);

    // Create & log in a user via Supertest agent (shares cookies)
    const user = await createTestUser({ displayName: 'Logout Test' });
    await agent.post('/api/auth/login').send({
      email: user.email,
      password: TEST_PASSWORD,
    });

    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logout successful');

    // /me should now 401
    const meRes = await agent.get('/api/auth/me');
    expect(meRes.status).toBe(401);

    await cleanupUsers([user.id]);
  });
});

// ============================================
// GET /api/auth/me
// ============================================

describe('GET /api/auth/me', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user when authenticated', async () => {
    const agent = request.agent(app);
    const user = await createTestUser({ displayName: 'Me Test' });

    await agent.post('/api/auth/login').send({
      email: user.email,
      password: TEST_PASSWORD,
    });

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.passwordHash).toBeUndefined();

    await cleanupUsers([user.id]);
  });
});

// ============================================
// GET /api/auth/ping
// ============================================

describe('GET /api/auth/ping', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/ping');
    expect(res.status).toBe(401);
  });

  it('returns 200 when authenticated', async () => {
    const agent = request.agent(app);
    const user = await createTestUser({ displayName: 'Ping Test' });

    await agent.post('/api/auth/login').send({
      email: user.email,
      password: TEST_PASSWORD,
    });

    const res = await agent.get('/api/auth/ping');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    await cleanupUsers([user.id]);
  });
});

// ============================================
// POST /api/auth/forgot-password
// ============================================

describe('POST /api/auth/forgot-password', () => {
  it('returns 400 when email is missing', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({});
    expect(res.status).toBe(400);
  });

  it('returns 200 regardless of whether the email exists (anti-enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: testEmail('nonexistent') });

    expect(res.status).toBe(200);
  });
});

// ============================================
// POST /api/auth/change-password
// ============================================

describe('POST /api/auth/change-password', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'NewPass1!Cozy' });

    expect(res.status).toBe(401);
  });

  it('changes the password for an authenticated user', async () => {
    const agent = request.agent(app);
    const newPassword = 'NewTestPass99!';
    const user = await createTestUser({ displayName: 'PwChange Test' });

    await agent.post('/api/auth/login').send({
      email: user.email,
      password: TEST_PASSWORD,
    });

    const res = await agent.post('/api/auth/change-password').send({
      currentPassword: TEST_PASSWORD,
      newPassword,
    });
    expect(res.status).toBe(200);

    // Old password should no longer work
    const reloginOld = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(reloginOld.status).toBe(401);

    // New password should work
    const reloginNew = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: newPassword });
    expect(reloginNew.status).toBe(200);

    await cleanupUsers([user.id]);
  });

  it('returns 401 for incorrect current password', async () => {
    const agent = request.agent(app);
    const user = await createTestUser({ displayName: 'BadPw Test' });

    await agent.post('/api/auth/login').send({
      email: user.email,
      password: TEST_PASSWORD,
    });

    const res = await agent.post('/api/auth/change-password').send({
      currentPassword: 'WrongCurrent1!',
      newPassword: 'NewPass1!Cozy',
    });
    expect(res.status).toBe(401);

    await cleanupUsers([user.id]);
  });
});

// ============================================
// Disconnect Prisma after all tests
// ============================================

afterAll(async () => {
  await prisma.$disconnect();
});
