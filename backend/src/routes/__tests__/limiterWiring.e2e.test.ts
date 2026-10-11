/**
 * Each rate limiter is attached to the routes it is meant to protect.
 *
 * rateLimiters.test.ts pins how each limiter behaves on a bare route; this
 * file pins where they are attached. For every row below it sends the limit's
 * worth of failing requests to the real route, from one address (or as one
 * account, for the limiters that count per account), and expects the next to
 * be refused with 429. Removing a limiter from a route fails its row.
 *
 * The first checks read every route from the routers and fail when a route
 * carries a limiter that has no row here, so a newly limited route is one
 * line in ROWS. A few rows point at the file that already fires the limit on
 * the live route, where the setup is too particular to repeat.
 *
 * The app trusts one proxy hop, as server.ts does, so each row's requests
 * come from an address of their own through X-Forwarded-For.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import path from 'path';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { mountedRoutes, routeKey } from '../../__tests__/helpers/routeInventory';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';
import {
  credentialLimiter,
  accountLoginLimiter,
  emailDispatchLimiter,
  accountCreationLimiter,
  mfaSetupLimiter,
  mfaLoginLimiter,
  mfaAccountLimiter,
} from '../auth';
import { passwordCheckLimiter } from '../../middleware/authLimiters';
import { uploadLimiter } from '../assets';
import {
  campaignPreviewLimiter,
  campaignImportLimiter,
  campaignExportLimiter,
} from '../../middleware/campaignArchiveLimits';

jest.setTimeout(60000);

const LIMITERS = new Map<RequestHandler, string>([
  [credentialLimiter, 'credentialLimiter'],
  [accountLoginLimiter, 'accountLoginLimiter'],
  [passwordCheckLimiter, 'passwordCheckLimiter'],
  [emailDispatchLimiter, 'emailDispatchLimiter'],
  [accountCreationLimiter, 'accountCreationLimiter'],
  [mfaSetupLimiter, 'mfaSetupLimiter'],
  [mfaLoginLimiter, 'mfaLoginLimiter'],
  [mfaAccountLimiter, 'mfaAccountLimiter'],
  [uploadLimiter, 'uploadLimiter'],
  [campaignPreviewLimiter, 'campaignPreviewLimiter'],
  [campaignImportLimiter, 'campaignImportLimiter'],
  [campaignExportLimiter, 'campaignExportLimiter'],
]);

/** What a row's requests are sent with. */
interface Context {
  address: string;
  /** Not signed in. */
  client: { get(url: string): request.Test; post(url: string): request.Test };
  /** Signed in as `user`, from `address`. */
  agent: request.Agent;
  /** A second sign-in of `user` left at the two-factor code step, from `address`; only with `mfa`. */
  pending: request.Agent;
  user: { id: string; email: string };
  /** A campaign `user` is the DM of. */
  campaignId: string;
}

interface Row {
  route: string;
  limiter: string;
  /** Requests allowed in the window; the next is refused. */
  limit: number;
  /** Turn on two-factor sign-in for the row's user once signed in. */
  mfa?: boolean;
  /** One request the route refuses or that counts anyway. */
  send?: (ctx: Context) => request.Test;
  /** The test file that already fires this limit on the live route. */
  testedIn?: string;
}

const WRONG = 'wrong-password';

const ROWS: Row[] = [
  { route: 'POST /api/auth/register', limiter: 'accountCreationLimiter', limit: 10, send: (c) => c.client.post('/api/auth/register').send({}) },
  { route: 'POST /api/auth/login', limiter: 'credentialLimiter', limit: 5, send: (c) => c.client.post('/api/auth/login').send({ email: c.user.email, password: WRONG }) },
  { route: 'POST /api/auth/login', limiter: 'accountLoginLimiter', limit: 10, testedIn: 'routes/__tests__/accountSignInLimiter.e2e.test.ts' },
  { route: 'POST /api/auth/forgot-password', limiter: 'emailDispatchLimiter', limit: 5, send: (c) => c.client.post('/api/auth/forgot-password').send({ email: 'nobody@test.invalid' }) },
  { route: 'POST /api/auth/reset-password', limiter: 'credentialLimiter', limit: 5, send: (c) => c.client.post('/api/auth/reset-password').send({ token: 'not-a-link', newPassword: 'Another1!Cozy' }) },
  { route: 'POST /api/auth/mfa/setup', limiter: 'credentialLimiter', limit: 5, send: (c) => c.agent.post('/api/auth/mfa/setup').send({ password: WRONG }) },
  { route: 'POST /api/auth/mfa/verify', limiter: 'mfaSetupLimiter', limit: 5, send: (c) => c.agent.post('/api/auth/mfa/verify').send({ token: '000000' }) },
  { route: 'POST /api/auth/mfa/verify-login', limiter: 'mfaLoginLimiter', limit: 5, mfa: true, send: (c) => c.pending.post('/api/auth/mfa/verify-login').send({ token: '000000' }) },
  { route: 'POST /api/auth/mfa/verify-login', limiter: 'mfaAccountLimiter', limit: 5, testedIn: 'routes/__tests__/mfaRateLimit.e2e.test.ts' },
  { route: 'POST /api/auth/mfa/disable', limiter: 'credentialLimiter', limit: 5, mfa: true, send: (c) => c.agent.post('/api/auth/mfa/disable').send({ password: WRONG, token: '000000' }) },
  { route: 'POST /api/auth/mfa/backup-codes', limiter: 'credentialLimiter', limit: 5, mfa: true, send: (c) => c.agent.post('/api/auth/mfa/backup-codes').send({ password: WRONG }) },
  { route: 'POST /api/auth/change-password', limiter: 'passwordCheckLimiter', limit: 10, send: (c) => c.agent.post('/api/auth/change-password').send({ currentPassword: WRONG, newPassword: 'Another1!Cozy' }) },
  { route: 'DELETE /api/auth/account', limiter: 'passwordCheckLimiter', limit: 10, send: (c) => c.agent.delete('/api/auth/account').send({ password: WRONG }) },
  { route: 'PUT /api/users/:id', limiter: 'passwordCheckLimiter', limit: 10, send: (c) => c.agent.put(`/api/users/${c.user.id}`).send({ email: 'moved@test.invalid', currentPassword: WRONG }) },
  { route: 'POST /api/assets/upload', limiter: 'uploadLimiter', limit: 30, send: (c) => c.agent.post('/api/assets/upload') },
  { route: 'POST /api/assets/documents', limiter: 'uploadLimiter', limit: 30, send: (c) => c.agent.post('/api/assets/documents').send({}) },
  { route: 'POST /api/campaigns/:campaignId/maps/import-uvtt', limiter: 'uploadLimiter', limit: 30, send: (c) => c.agent.post(`/api/campaigns/${c.campaignId}/maps/import-uvtt`) },
  { route: 'GET /api/campaigns/:campaignId/export', limiter: 'campaignExportLimiter', limit: 20, testedIn: 'routes/__tests__/campaignArchiveLimits.e2e.test.ts' },
  { route: 'POST /api/campaigns/import/preview', limiter: 'campaignPreviewLimiter', limit: 20, testedIn: 'routes/__tests__/campaignArchiveLimits.e2e.test.ts' },
  { route: 'POST /api/campaigns/import', limiter: 'campaignImportLimiter', limit: 20, testedIn: 'routes/__tests__/campaignArchiveLimits.e2e.test.ts' },
];

const rowKey = (route: string, limiter: string) => `${route} ${limiter}`;

/** Anything that looks like a limiter: express-rate-limit's, or one of ours. */
const isLimiter = (handler: unknown): boolean =>
  typeof handler === 'function' && ('resetKey' in handler || 'recordFailure' in handler);

const routes = mountedRoutes(createTestApp());

describe('the table', () => {
  it('names every limiter attached to a route', () => {
    const unnamed = routes.flatMap((r) =>
      r.handlers.filter((h) => isLimiter(h) && !LIMITERS.has(h as RequestHandler)).map(() => routeKey(r))
    );
    // A limiter here is new: add it to LIMITERS, and its routes to ROWS.
    expect(unnamed).toEqual([]);
  });

  it('has a row for every limiter on every route', () => {
    const attached = routes.flatMap((r) =>
      r.handlers.filter((h) => LIMITERS.has(h as RequestHandler)).map((h) => rowKey(routeKey(r), LIMITERS.get(h as RequestHandler) ?? ''))
    );
    const rows = new Set(ROWS.map((row) => rowKey(row.route, row.limiter)));
    expect(attached.filter((key) => !rows.has(key))).toEqual([]);
  });

  it('has no row for a limiter that is not on its route', () => {
    const attached = new Set(
      routes.flatMap((r) =>
        r.handlers.filter((h) => LIMITERS.has(h as RequestHandler)).map((h) => rowKey(routeKey(r), LIMITERS.get(h as RequestHandler) ?? ''))
      )
    );
    expect(ROWS.map((row) => rowKey(row.route, row.limiter)).filter((key) => !attached.has(key))).toEqual([]);
  });

  it('points only at test files that exist', () => {
    const src = path.resolve(__dirname, '../..');
    const missing = ROWS.filter((row) => row.testedIn && !fs.existsSync(path.join(src, row.testedIn)));
    expect(missing).toEqual([]);
  });
});

describe('each limited route', () => {
  const proxied = express();
  proxied.set('trust proxy', 1);
  proxied.use(createTestApp());

  const created: string[] = [];
  const campaigns: string[] = [];
  let addressCounter = 0;

  afterAll(async () => {
    await cleanupCampaigns(campaigns);
    await cleanupUsers(created);
    await prisma.$disconnect();
  });

  /** A user and campaign of the row's own, signed in from an address of its own. */
  async function contextFor(row: Row): Promise<Context> {
    addressCounter += 1;
    const address = `10.91.${Math.floor(addressCounter / 250)}.${addressCounter % 250}`;
    const user = await createTestUser({ displayName: 'Limiter wiring' });
    created.push(user.id);
    const campaign = await createTestCampaign(user.id);
    campaigns.push(campaign.id);
    await prisma.campaignMembership.create({ data: { userId: user.id, campaignId: campaign.id, role: 'DM', characterIds: [] } });

    // Every request from this row carries the row's address.
    const agent = request.agent(proxied).set('X-Forwarded-For', address);
    const login = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    // With MFA on, a second sign-in stops at the code step; the row's user
    // stays signed in on `agent`.
    const pending = request.agent(proxied).set('X-Forwarded-For', address);
    if (row.mfa) {
      await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' } });
      const second = await pending.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
      expect(second.body.mfaRequired).toBe(true);
    }

    const client = {
      get: (url: string) => request(proxied).get(url).set('X-Forwarded-For', address),
      post: (url: string) => request(proxied).post(url).set('X-Forwarded-For', address),
    };

    return { address, client, agent, pending, user: { id: user.id, email: user.email }, campaignId: campaign.id };
  }

  it.each(ROWS.filter((row) => row.send).map((row) => [row.route, row.limiter, row]))(
    '%s refuses the request after the limit of %s',
    async (_route, _limiter, row) => {
      const ctx = await contextFor(row);
      const send = row.send as (c: Context) => request.Test;

      const allowed: number[] = [];
      for (let i = 0; i < row.limit; i++) allowed.push((await send(ctx)).status);
      expect(allowed.filter((status) => status === 429)).toEqual([]);

      expect((await send(ctx)).status).toBe(429);
    }
  );
});
