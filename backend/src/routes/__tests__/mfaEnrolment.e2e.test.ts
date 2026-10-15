/**
 * Turning MFA on asks for the password, and signs out the other devices.
 *
 * Enrolling an authenticator decides who can sign in from then on. Without a
 * password check, a stolen session could enrol an authenticator of its own and
 * the owner would be asked, at their next sign-in, for a code they cannot
 * produce. Turning MFA off already needs the password and ends the other
 * sessions; turning it on now does the same.
 *
 * The session store is mocked, as in accessRevocation.e2e: the test app keeps
 * sessions in memory, so what can be pinned is that the helper is called for
 * the right user with the current session kept.
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

jest.mock('../../services/sessionStore', () => ({
  destroyUserLoginSessions: jest.fn(async () => 1),
  // Sign-in bookkeeping, not under test here; the real one is tested in
  // services/__tests__/sessionStoreCap.test.ts.
  capLoginSessions: jest.fn(async () => 0),
}));

import request from 'supertest';
import { generateSync } from 'otplib';
import type { Request, Response, NextFunction } from 'express';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { destroyUserLoginSessions } from '../../services/sessionStore';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const created: string[] = [];
const destroyed = destroyUserLoginSessions as jest.MockedFunction<typeof destroyUserLoginSessions>;

async function signedIn(label: string) {
  const user = await createTestUser({ email: `mfa-enrol-${label}-${stamp}@test.cozyvtt.local` });
  created.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { user, agent };
}

/** RFC 4648 base32, as an authenticator app reads a secret, to bytes. */
function fromBase32(text: string): number[] {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const out: number[] = [];
  let value = 0;
  let bits = 0;
  for (const ch of text.replace(/=+$/, '')) {
    const index = alphabet.indexOf(ch);
    if (index === -1) throw new Error(`${JSON.stringify(ch)} is not base32`);
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return out;
}

beforeEach(() => destroyed.mockClear());

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

describe('POST /api/auth/mfa/setup', () => {
  it('is refused without the password, and stores no secret', async () => {
    const { user, agent } = await signedIn('nopw');
    const res = await agent.post('/api/auth/mfa/setup').send({});
    expect(res.status).toBe(400);
    expect(res.body.secret).toBeUndefined();
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.mfaSecret).toBeNull();
  });

  it('is refused with the wrong password', async () => {
    const { user, agent } = await signedIn('badpw');
    const res = await agent.post('/api/auth/mfa/setup').send({ password: 'NotTheRightOne1!' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/password/i);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.mfaSecret).toBeNull();
  });

  it('starts enrolment with the password', async () => {
    const { agent } = await signedIn('ok');
    const res = await agent.post('/api/auth/mfa/setup').send({ password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(typeof res.body.secret).toBe('string');
  });

  // A secret of twenty printable characters holds about 127 bits; twenty
  // random bytes hold 160, which is what authenticator apps expect. Each
  // setup checks the password with argon2, which is slow on purpose, so the
  // test takes three secrets and allows itself more than the default 5 s.
  it('makes each secret from 20 random bytes of any value, not 20 printable characters', async () => {
    const { agent } = await signedIn('bytes');
    const bytes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await agent.post('/api/auth/mfa/setup').send({ password: TEST_PASSWORD });
      expect(res.status).toBe(200);
      const secret = fromBase32(res.body.secret);
      expect(secret).toHaveLength(20);
      bytes.push(...secret);
    }
    // Printable characters run from 0x21 to 0x7e. 60 random bytes all
    // falling below 0x80 has odds of one in 2 to the 60th.
    expect(bytes.some((b) => b >= 0x80)).toBe(true);
  }, 20000);
});

describe('POST /api/auth/mfa/verify', () => {
  it('signs out the account\'s other sessions once MFA is on, keeping this one', async () => {
    const { user, agent } = await signedIn('verify');
    const setup = await agent.post('/api/auth/mfa/setup').send({ password: TEST_PASSWORD });
    expect(setup.status).toBe(200);

    const token = generateSync({ secret: setup.body.secret });
    const res = await agent.post('/api/auth/mfa/verify').send({ token });
    expect(res.status).toBe(200);

    expect(destroyed).toHaveBeenCalledWith(user.id, expect.any(String));
    // The device that turned it on is still signed in.
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });
});
