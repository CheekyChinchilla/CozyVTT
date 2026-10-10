/**
 * Campaign archives that try to make the server run out of memory.
 *
 * Any signed-in user can send an archive to the import routes. The archive
 * is a ZIP, and a ZIP entry can unpack to a thousand times its packed size,
 * so a file of a few hundred kilobytes can hold a manifest of hundreds of
 * megabytes. Each entry used to be unpacked whole into memory before its size
 * was checked, which let one request end the backend for every table. These
 * send such archives and measure how far the process's memory grows.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-import-bounds-'));
process.env.UPLOAD_DIR = path.join(SCRATCH, 'uploads');

// The real file-type is ESM-only; this knows the two signatures these archives use.
jest.mock('file-type', () => {
  const sniff = (head: Buffer) =>
    head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? { ext: 'png', mime: 'image/png' } : undefined;
  return {
    fileTypeFromBuffer: async (buf: Buffer) => sniff(buf),
    fileTypeFromFile: async (file: string) => {
      const { readFileSync } = jest.requireActual<typeof import('fs')>('fs');
      return sniff(readFileSync(file).subarray(0, 16));
    },
  };
});

import request from 'supertest';
import unzipper from 'unzipper';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { prisma as appPrisma } from '../../config/database';
import { writeZip, claimUnpackedSize, repeatedBytes, writeManyEntryZip, type FixtureEntry } from '../../__tests__/helpers/zipFixtures';

const MB = 1024 * 1024;
const app = createTestApp();
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

/** What a bomb unpacks to, and the most memory growth these allow while refusing one. */
const BOMB_BYTES = 600 * MB;
const MEMORY_CEILING = 200 * MB;

const manifest = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    formatVersion: 1,
    exportedAt: '2026-10-06T00:00:00.000Z',
    exportedFrom: 'CozyVTT test',
    campaignName: 'Bounded',
    gameSystem: 'DND_5E',
    mapCount: 0,
    tokenCount: 0,
    creatureCount: 0,
    tokenTemplateCount: 0,
    assetCount: 0,
    includesAudio: false,
    totalSizeBytes: 0,
    ...overrides,
  });
const campaignJson = JSON.stringify({ name: 'Bounded' });

let userId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Import Bounds Player' });
  userId = user.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await prisma.campaign.deleteMany({ where: { ownerId: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

/** Run `work`, sampling the process's resident memory, and report the largest growth seen. */
async function peakMemoryGrowth<T>(work: () => Promise<T>): Promise<{ result: T; growth: number }> {
  const before = process.memoryUsage().rss;
  let peak = before;
  const sample = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 5);
  try {
    const result = await work();
    peak = Math.max(peak, process.memoryUsage().rss);
    return { result, growth: peak - before };
  } finally {
    clearInterval(sample);
  }
}

async function archive(name: string, entries: FixtureEntry[]): Promise<string> {
  const file = path.join(SCRATCH, name);
  await writeZip(file, entries);
  return file;
}

describe('a manifest that unpacks to hundreds of megabytes', () => {
  let honest: string;
  let lying: string;

  beforeAll(async () => {
    const bomb = (): FixtureEntry => ({ name: 'manifest.json', data: () => repeatedBytes(BOMB_BYTES) });
    honest = await archive('honest-bomb.cozyvtt', [bomb(), { name: 'campaign.json', data: campaignJson }]);
    lying = await archive('lying-bomb.cozyvtt', [bomb(), { name: 'campaign.json', data: campaignJson }]);
    claimUnpackedSize(lying, 'manifest.json', 100);
    // The point of a bomb: small to send.
    expect(fs.statSync(honest).size).toBeLessThan(2 * MB);
  }, 120_000);

  it('is refused by the preview, without unpacking it into memory', async () => {
    const { result: res, growth } = await peakMemoryGrowth(() =>
      agent.post('/api/campaigns/import/preview').attach('file', honest)
    );
    expect(res.status).toBe(400);
    expect(growth).toBeLessThan(MEMORY_CEILING);
  }, 60_000);

  it('is refused by the preview when the archive claims the manifest is small', async () => {
    const { result: res, growth } = await peakMemoryGrowth(() =>
      agent.post('/api/campaigns/import/preview').attach('file', lying)
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/manifest\.json/);
    expect(growth).toBeLessThan(MEMORY_CEILING);
  }, 60_000);

  it('is refused by the import, without unpacking it into memory', async () => {
    const { result: res, growth } = await peakMemoryGrowth(() =>
      agent.post('/api/campaigns/import').attach('file', lying)
    );
    expect(res.status).toBe(400);
    expect(growth).toBeLessThan(MEMORY_CEILING);
    expect(await prisma.campaign.count({ where: { ownerId: userId } })).toBe(0);
  }, 60_000);
});

describe('a picture that unpacks to far more than its type allows', () => {
  it('is left out of the import, without unpacking it into memory', async () => {
    const assetId = '11111111-1111-4111-8111-111111111111';
    const file = await archive('asset-bomb.cozyvtt', [
      { name: 'manifest.json', data: manifest({ assetCount: 1 }) },
      { name: 'campaign.json', data: campaignJson },
      {
        name: 'assets/asset-manifest.json',
        data: JSON.stringify({ [assetId]: { originalName: 'goblin.png', mimeType: 'image/png', type: 'TOKEN', fileSize: 100 } }),
      },
      { name: `assets/${assetId}.png`, data: () => repeatedBytes(BOMB_BYTES, 0) },
    ]);
    claimUnpackedSize(file, `assets/${assetId}.png`, 100);

    const { result: res, growth } = await peakMemoryGrowth(() => agent.post('/api/campaigns/import').attach('file', file));

    expect(res.status).toBe(201);
    expect(growth).toBeLessThan(MEMORY_CEILING);
    expect(await prisma.asset.count({ where: { campaignId: res.body.campaignId } })).toBe(0);
    // Nothing of the refused picture is left on disk.
    const leftovers = (dir: string): string[] =>
      fs.existsSync(dir)
        ? (fs.readdirSync(dir, { recursive: true }) as string[]).filter((f) => fs.statSync(path.join(dir, f)).isFile())
        : [];
    expect(leftovers(path.join(SCRATCH, 'uploads'))).toEqual([]);
  }, 120_000);
});

describe('pictures that together unpack past the archive limit', () => {
  it('stop the import', async () => {
    // A server whose archive limit is 20 MB, so three 9 MB pictures pass it.
    jest
      .spyOn(appPrisma.systemSettings, 'findFirst')
      .mockResolvedValue({ campaignExportSizeLimit: 20 * MB } as unknown as Awaited<ReturnType<typeof appPrisma.systemSettings.findFirst>>);
    const ids = ['22222222-2222-4222-8222-222222222221', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222223'];
    const picture = () => Buffer.concat([PNG_SIGNATURE, Buffer.alloc(9 * MB)]);
    const file = await archive('too-much-in-total.cozyvtt', [
      { name: 'manifest.json', data: manifest({ assetCount: 3 }) },
      { name: 'campaign.json', data: campaignJson },
      {
        name: 'assets/asset-manifest.json',
        data: JSON.stringify(Object.fromEntries(ids.map((id) => [id, { originalName: `${id}.png`, mimeType: 'image/png', type: 'MAP', fileSize: 9 * MB }]))),
      },
      ...ids.map((id) => ({ name: `assets/${id}.png`, data: picture() })),
    ]);

    const res = await agent.post('/api/campaigns/import').attach('file', file);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/20 MB/);
  }, 60_000);
});

describe('an archive whose directory lists more entries than an import allows', () => {
  let many: string;
  beforeAll(async () => {
    many = path.join(SCRATCH, 'many.cozyvtt');
    await writeManyEntryZip(many, 1001, [
      { name: 'manifest.json', data: manifest() },
      { name: 'campaign.json', data: campaignJson },
    ]);
  }, 60_000);

  // A directory is read whole before anything can count it, and reading one
  // costs over a kilobyte of memory an entry. A 50 MB archive can list a
  // million entries.
  it.each(['/api/campaigns/import/preview', '/api/campaigns/import'])('is refused by %s before its directory is read', async (route) => {
    const readFromDisk = jest.spyOn(unzipper.Open, 'file');
    const readFromMemory = jest.spyOn(unzipper.Open, 'buffer');

    const res = await agent.post(route).attach('file', many);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/1,?000/);
    expect(readFromDisk).not.toHaveBeenCalled();
    expect(readFromMemory).not.toHaveBeenCalled();
  }, 60_000);
});
