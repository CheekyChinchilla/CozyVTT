/**
 * Per-user limits on campaign archives.
 *
 * Previewing, importing and exporting a campaign each move up to 500 MB
 * through the one backend every table shares, and any signed-in user can
 * preview and import. Each user may start 20 of each an hour, counted apart,
 * and one at a time across all three. Asset uploads are not archives and
 * are not counted.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-archive-limits-'));
process.env.UPLOAD_DIR = path.join(SCRATCH, 'uploads');

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { writeZip } from '../../__tests__/helpers/zipFixtures';
import { resolveCampaignArchiveRateLimit } from '../../middleware/campaignArchiveLimits';

const app = createTestApp();
const LIMIT = 20;

const manifest = JSON.stringify({
  formatVersion: 1, exportedAt: '2026-10-06T00:00:00.000Z', exportedFrom: 'CozyVTT test', campaignName: 'Limits',
  gameSystem: 'DND_5E', mapCount: 0, tokenCount: 0, creatureCount: 0, tokenTemplateCount: 0, assetCount: 0,
  includesAudio: false, totalSizeBytes: 0,
});

const userIds: string[] = [];
let archive: string;

async function signedIn(label: string) {
  const user = await createTestUser({ displayName: `Archive Limits ${label}` });
  userIds.push(user.id);
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  expect(login.status).toBe(200);
  return { agent, user, cookie: (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0] };
}

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  port = (server.address() as AddressInfo).port;
  archive = path.join(SCRATCH, 'small.cozyvtt');
  await writeZip(archive, [
    { name: 'manifest.json', data: manifest },
    { name: 'campaign.json', data: '{"name":"Limits"}' },
  ]);
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.campaign.deleteMany({ where: { ownerId: { in: userIds } } });
  await cleanupUsers(userIds);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

/**
 * Send a request with its whole body already written, and read the answer.
 *
 * A refusal is answered before the upload is read. supertest goes on piping
 * the form after that answer arrives, and on a busy machine that fails the
 * test with EPIPE; a browser, and this, simply read the answer.
 */
function send(cookie: string, method: 'GET' | 'POST', route: string): Promise<{ status: number; body: { message?: string } }> {
  const boundary = '----CozyLimits';
  const payload =
    method === 'POST'
      ? Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="small.cozyvtt"\r\nContent-Type: application/zip\r\n\r\n`),
          fs.readFileSync(archive),
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ])
      : Buffer.alloc(0);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1', port, path: route, method,
        headers: { Cookie: cookie, 'Content-Length': payload.length, ...(method === 'POST' ? { 'Content-Type': `multipart/form-data; boundary=${boundary}` } : {}) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode ?? 0, body: text.startsWith('{') ? JSON.parse(text) : {} });
        });
      }
    );
    req.on('error', reject);
    req.end(payload);
  });
}

describe('CAMPAIGN_ARCHIVE_RATE_LIMIT', () => {
  it('is 20 an hour when unset or empty', () => {
    expect(resolveCampaignArchiveRateLimit({})).toBe(20);
    expect(resolveCampaignArchiveRateLimit({ CAMPAIGN_ARCHIVE_RATE_LIMIT: '' })).toBe(20);
  });

  it('takes a whole number above zero', () => {
    expect(resolveCampaignArchiveRateLimit({ CAMPAIGN_ARCHIVE_RATE_LIMIT: '100' })).toBe(100);
  });

  it.each(['0', '-3', '2.5', 'lots'])('falls back to 20 for %s, without failing', (value) => {
    expect(resolveCampaignArchiveRateLimit({ CAMPAIGN_ARCHIVE_RATE_LIMIT: value })).toBe(20);
  });
});

describe('each user may preview 20 archives an hour', () => {
  it('answers the 21st with 429, saying when to try again', async () => {
    const { agent, cookie } = await signedIn('previewer');
    for (let i = 0; i < LIMIT; i++) {
      expect((await agent.post('/api/campaigns/import/preview').attach('file', archive)).status).toBe(200);
    }
    const refused = await send(cookie, 'POST', '/api/campaigns/import/preview');
    expect(refused.status).toBe(429);
    expect(refused.body.message).toMatch(/^You have opened 20 campaign archives in the last hour, the most this server allows\. Try again in \d+ minutes?\.$/);

    // Counted apart: the same user can still import.
    expect((await agent.post('/api/campaigns/import').attach('file', archive)).status).toBe(201);
  }, 60_000);

  it('counts each user separately', async () => {
    const first = await signedIn('first');
    const second = await signedIn('second');
    for (let i = 0; i < LIMIT; i++) await first.agent.post('/api/campaigns/import/preview').attach('file', archive);
    expect((await send(first.cookie, 'POST', '/api/campaigns/import/preview')).status).toBe(429);
    expect((await second.agent.post('/api/campaigns/import/preview').attach('file', archive)).status).toBe(200);
  }, 60_000);

  it('does not count asset uploads', async () => {
    const { agent } = await signedIn('uploader');
    for (let i = 0; i < LIMIT; i++) await agent.post('/api/campaigns/import/preview').attach('file', archive);
    // Refused for its content, not by the archive limit.
    const upload = await agent.post('/api/assets/upload').field('type', 'TOKEN').attach('file', Buffer.from('not a picture'), 'x.png');
    expect(upload.status).not.toBe(429);
  }, 60_000);
});

describe('each user may import 20 campaigns an hour', () => {
  it('answers the 21st with 429', async () => {
    const { agent, cookie } = await signedIn('importer');
    for (let i = 0; i < LIMIT; i++) {
      expect((await agent.post('/api/campaigns/import').attach('file', archive)).status).toBe(201);
    }
    const refused = await send(cookie, 'POST', '/api/campaigns/import');
    expect(refused.status).toBe(429);
    expect(refused.body.message).toMatch(/^You have imported 20 campaigns in the last hour/);
  }, 60_000);
});

describe('each DM may export 20 campaigns an hour', () => {
  it('answers the 21st with 429', async () => {
    const { agent, user, cookie } = await signedIn('exporter');
    const campaignId = (await createTestCampaign(user.id, { name: 'Exported often' })).id;
    await prisma.campaignMembership.create({ data: { userId: user.id, campaignId, role: 'DM', characterIds: [] } });
    for (let i = 0; i < LIMIT; i++) {
      expect((await agent.get(`/api/campaigns/${campaignId}/export`)).status).toBe(200);
    }
    const refused = await send(cookie, 'GET', `/api/campaigns/${campaignId}/export`);
    expect(refused.status).toBe(429);
    expect(refused.body.message).toMatch(/^You have exported 20 campaigns in the last hour/);
  }, 60_000);
});

describe('one archive at a time', () => {
  /** Start uploading an archive and stop part-way, holding the request open. */
  function startSlowUpload(cookie: string) {
    const boundary = '----CozyLimits';
    const req = http.request({
      host: '127.0.0.1', port, path: '/api/campaigns/import/preview', method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': 5_000_000, Cookie: cookie },
    });
    req.on('error', () => undefined);
    req.write(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="slow.cozyvtt"\r\nContent-Type: application/zip\r\n\r\n${'x'.repeat(1000)}`);
    return req;
  }

  it('refuses a second archive while the first is still uploading, and allows one once it has gone', async () => {
    const { cookie } = await signedIn('one-at-a-time');
    const other = await signedIn('someone-else');
    const slow = startSlowUpload(cookie);
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));

        const second = await send(cookie, 'POST', '/api/campaigns/import/preview');
      expect(second.status).toBe(429);
      expect(second.body.message).toBe('Another campaign import or export of yours is still running. Wait for it to finish, then try again.');
      // Someone else is not held up.
      expect((await other.agent.post('/api/campaigns/import/preview').attach('file', archive)).status).toBe(200);
    } finally {
      slow.destroy();
    }
    let after = 429;
    for (let waited = 0; after === 429 && waited < 3000; waited += 100) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      after = (await send(cookie, 'POST', '/api/campaigns/import/preview')).status;
    }
    expect(after).toBe(200);
  }, 30_000);
});
