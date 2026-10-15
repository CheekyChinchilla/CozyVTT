/**
 * Every express-rate-limit limiter the server makes, checked the way the
 * library checks it.
 *
 * express-rate-limit looks over each limiter's settings when it is made, and
 * over the first request through it, and writes any problem it finds to the
 * console once, then stops checking. One of its checks refuses a custom key
 * that reads the visitor's address without `ipKeyGenerator`, the helper that
 * counts an IPv6 visitor by their /56 network: each of those visitors has a
 * whole network of addresses to move between. A message here would show up
 * once in a self-hoster's log and never again, so this suite is where it is
 * caught.
 *
 * The modules are loaded after the console is watched, so a message written
 * while they make their limiters is seen. Each limiter is then sent one
 * request from an IPv4 and one from an IPv6 address, through one trusted
 * proxy as in production, with no session, so the custom keys fall back to
 * the address.
 */

import express, { type Request, type RequestHandler, type Response } from 'express';
import request from 'supertest';

const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

/** What express-rate-limit wrote, as text, so a failure names the check. */
function written(): string[] {
  return [...consoleError.mock.calls, ...consoleWarn.mock.calls].map((args) => args.map(String).join(' '));
}

const smtpBefore = { host: process.env.SMTP_HOST, user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };

afterAll(() => {
  consoleError.mockRestore();
  consoleWarn.mockRestore();
  for (const [name, value] of [['SMTP_HOST', smtpBefore.host], ['SMTP_USER', smtpBefore.user], ['SMTP_PASS', smtpBefore.pass]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

let limiters: Array<[string, RequestHandler]> = [];

beforeAll(async () => {
  const { createGeneralApiLimiter } = await import('../../app');
  const { emailDispatchLimiter, accountCreationLimiter, mfaSetupLimiter } = await import('../../routes/auth');
  const { uploadLimiter } = await import('../../routes/assets');
  const { campaignPreviewLimiter, campaignImportLimiter, campaignExportLimiter } = await import('../campaignArchiveLimits');
  const { invitationEmailLimiter } = await import('../invitationEmailLimiter');
  const { leftNotesDownloadLimiter } = await import('../leftNotesDownloadLimiter');
  limiters = [
    ['the general limit', createGeneralApiLimiter()],
    ['emailDispatchLimiter', emailDispatchLimiter],
    ['accountCreationLimiter', accountCreationLimiter],
    ['mfaSetupLimiter', mfaSetupLimiter],
    ['uploadLimiter', uploadLimiter],
    ['campaignPreviewLimiter', campaignPreviewLimiter],
    ['campaignImportLimiter', campaignImportLimiter],
    ['campaignExportLimiter', campaignExportLimiter],
    ['invitationEmailLimiter', invitationEmailLimiter],
    ['leftNotesDownloadLimiter', leftNotesDownloadLimiter],
  ];
  // The invitation limiter counts only invitations that send an email, which
  // needs mail settings; without them every request would skip it.
  process.env.SMTP_HOST = 'smtp.example.invalid';
  process.env.SMTP_USER = 'user';
  process.env.SMTP_PASS = 'pass';
});

it('writes nothing while the limiters are made', () => {
  expect(limiters).toHaveLength(10);
  expect(written()).toEqual([]);
});

it('writes nothing when a request from each kind of address goes through each limiter', async () => {
  // Only what the requests bring out; the test above covers the making.
  consoleError.mockClear();
  consoleWarn.mockClear();
  for (const [name, limiter] of limiters) {
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.post('/probe', limiter, (_req: Request, res: Response) => res.status(200).json({ ok: true }));
    for (const address of ['10.77.0.1', '2001:db8:77::1']) {
      const res = await request(app).post('/probe').set('X-Forwarded-For', address).send({ sendEmail: true });
      expect([name, address, res.status]).toEqual([name, address, 200]);
    }
  }
  expect(written()).toEqual([]);
});
