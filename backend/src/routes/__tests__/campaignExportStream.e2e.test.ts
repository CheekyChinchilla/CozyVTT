/**
 * Campaign export, streamed.
 *
 * The export built the whole archive in memory and then sent it, holding it
 * twice at the end, inside a backend whose container has 512 MB for every
 * table. One export of a campaign with a few large maps could end the
 * server, and nothing checked its size against the limit an import would
 * accept. The archive now goes to the response as it is made, after a check
 * of the files it would hold.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-export-stream-'));
const UPLOAD_DIR = path.join(SCRATCH, 'uploads');
process.env.UPLOAD_DIR = UPLOAD_DIR;

import request from 'supertest';
import unzipper from 'unzipper';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { prisma as appPrisma } from '../../config/database';
import logger from '../../utils/logger';

const MB = 1024 * 1024;
const app = createTestApp();
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

let dmId: string;
let campaignId: string;
let cookie: string;
let agent: ReturnType<typeof request.agent>;
let server: http.Server;
let port: number;

/** A picture of `bytes` on disk, recorded as `recordedBytes`, used as the map's. */
async function mapWithPicture(name: string, bytes: number, recordedBytes = bytes, type: 'MAP' | 'AUDIO' = 'MAP') {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const file = path.join(UPLOAD_DIR, `${name}.png`);
  const out = fs.createWriteStream(file);
  out.write(PNG_SIGNATURE);
  // Random, as a real picture's bytes are as good as: one block repeated at
  // a distance deflate cannot see across, so the archive is as large as the file.
  const chunk = crypto.randomBytes(MB);
  for (let left = bytes - PNG_SIGNATURE.length; left > 0; left -= MB) out.write(left >= MB ? chunk : chunk.subarray(0, left));
  await new Promise<void>((resolve) => out.end(() => resolve()));
  const asset = await prisma.asset.create({
    data: {
      type, scope: 'CAMPAIGN', campaignId, uploadedById: dmId, filename: `${name}.png`, originalName: `${name}.png`,
      mimeType: 'image/png', fileSize: recordedBytes, filePath: file, name,
    },
  });
  const address = `/api/assets/maps/${asset.id}`;
  await prisma.map.create({
    data: { campaignId, name, imageUrl: address, baseLayerUrl: address, width: 10, height: 10, gridSize: 50, annotations: [], tokens: [] },
  });
}

beforeAll(async () => {
  const dm = await createTestUser({ displayName: 'Export Stream DM' });
  dmId = dm.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Big Maps' })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email: dm.email, password: TEST_PASSWORD });
  expect(login.status).toBe(200);
  cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  jest.restoreAllMocks();
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.asset.deleteMany({ where: { campaignId } });
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.campaign.deleteMany({ where: { ownerId: dmId } });
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

/** GET the export over a real socket, calling `onFirstChunk` when its first bytes arrive. */
function exportOverSocket(onFirstChunk: () => void): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: `/api/campaigns/${campaignId}/export`, headers: { Cookie: cookie } }, (res) => {
        const chunks: Buffer[] = [];
        let first = true;
        res.on('data', (chunk: Buffer) => {
          if (first) {
            first = false;
            onFirstChunk();
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

describe('a campaign export', () => {
  it('starts arriving before the archive is finished', async () => {
    await mapWithPicture('Large Keep', 40 * MB);
    // The exporter logs this once the whole archive has been written.
    const info = jest.spyOn(logger, 'info');
    const finished = () => info.mock.calls.some((call) => (call as unknown[])[0] === 'Campaign exported');
    let finishedAtFirstChunk: boolean | undefined;

    const res = await exportOverSocket(() => {
      finishedAtFirstChunk = finished();
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toBe('attachment; filename="Big_Maps-export.cozyvtt"');
    expect(finishedAtFirstChunk).toBe(false);
    expect(finished()).toBe(true);
    // And it is a whole archive, picture included.
    const entries = (await unzipper.Open.buffer(res.body)).files;
    expect(entries.map((e) => e.path)).toEqual(expect.arrayContaining(['manifest.json', 'campaign.json', 'maps/map-0.json']));
    const picture = entries.find((e) => e.path.startsWith('assets/') && e.path.endsWith('.png'));
    expect(picture?.uncompressedSize).toBe(40 * MB);
  }, 60_000);

  it('keeps memory bounded however large the campaign is', async () => {
    await mapWithPicture('Huge Keep', 150 * MB);
    const before = process.memoryUsage().rss;
    let peak = before;
    const sample = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss);
    }, 5);
    let received = 0;
    try {
      await new Promise<void>((resolve, reject) => {
        http
          .get({ host: '127.0.0.1', port, path: `/api/campaigns/${campaignId}/export`, headers: { Cookie: cookie } }, (res) => {
            expect(res.statusCode).toBe(200);
            res.on('data', (chunk: Buffer) => {
              received += chunk.length;
            });
            res.on('end', () => resolve());
            res.on('error', reject);
          })
          .on('error', reject);
      });
    } finally {
      clearInterval(sample);
    }
    expect(received).toBeGreaterThan(150 * MB);
    // Streaming costs about the same however large the campaign: 140 MB or so
    // here, at 150 MB or 300 MB, most of it buffers waiting to be collected in
    // a process that is the client too. Held whole, the archive cost twice its
    // size: 286 MB for this one.
    expect(peak - before).toBeLessThan(200 * MB);
  }, 120_000);

  it('is refused with a clear message when its files add up to more than an archive may hold', async () => {
    // A server whose archive limit is 5 MB; the picture is recorded as 8 MB.
    jest
      .spyOn(appPrisma.systemSettings, 'findFirst')
      .mockResolvedValue({ campaignExportSizeLimit: 5 * MB } as unknown as Awaited<ReturnType<typeof appPrisma.systemSettings.findFirst>>);
    await mapWithPicture('Recorded Large', 1000, 8 * MB);

    const res = await agent.get(`/api/campaigns/${campaignId}/export`);

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: 'Export Too Large',
      message:
        "This campaign's files add up to 8 MB, more than the 5 MB a campaign archive can hold on this server. " +
        'Remove maps or pictures the campaign no longer uses, then export again.',
    });
  });

  it('says to leave out audio when that is what takes it over the limit', async () => {
    jest
      .spyOn(appPrisma.systemSettings, 'findFirst')
      .mockResolvedValue({ campaignExportSizeLimit: 5 * MB } as unknown as Awaited<ReturnType<typeof appPrisma.systemSettings.findFirst>>);
    await mapWithPicture('Small Map', 1000, 2 * MB);
    await mapWithPicture('Battle Music', 1000, 6 * MB, 'AUDIO');

    const res = await agent.get(`/api/campaigns/${campaignId}/export?includeAudio=true`);

    expect(res.status).toBe(422);
    expect(res.body.message).toBe(
      "This campaign's files add up to 8 MB, more than the 5 MB a campaign archive can hold on this server. " +
        'Without audio it is 2 MB: turn off Include audio assets and export again.'
    );
    // And without audio it goes through.
    expect((await agent.get(`/api/campaigns/${campaignId}/export`)).status).toBe(200);
  });
});
