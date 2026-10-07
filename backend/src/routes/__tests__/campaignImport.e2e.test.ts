/**
 * Campaign import and its preview, end to end.
 *
 * Any signed-in user may import a campaign, players included; they become
 * its owner and DM. These cover the round trip from an export, the archives
 * the routes refuse, and that an uploaded archive does not outlive its
 * request.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-import-e2e-'));
const UPLOAD_DIR = path.join(SCRATCH, 'uploads');
process.env.UPLOAD_DIR = UPLOAD_DIR;

// The real file-type is ESM-only; this knows the signatures these archives use.
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
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { writeZip, renameEntry } from '../../__tests__/helpers/zipFixtures';

const app = createTestApp();
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);
const IMPORT_TEMP = path.join(UPLOAD_DIR, 'temp', 'campaign-imports');

const manifest = JSON.stringify({
  formatVersion: 1,
  exportedAt: '2026-10-06T00:00:00.000Z',
  exportedFrom: 'CozyVTT test',
  campaignName: 'Crafted',
  gameSystem: 'DND_5E',
  mapCount: 0,
  tokenCount: 0,
  creatureCount: 0,
  tokenTemplateCount: 0,
  assetCount: 0,
  includesAudio: false,
  totalSizeBytes: 0,
});

let dmId: string;
let playerId: string;
let playerEmail: string;
let sourceCampaignId: string;
let dm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;
let exported: string;

async function signIn(email: string) {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

/** Files left in the import routes' temporary folder. */
const tempFiles = () => (fs.existsSync(IMPORT_TEMP) ? fs.readdirSync(IMPORT_TEMP) : []);

beforeAll(async () => {
  const dmUser = await createTestUser({ displayName: 'Import DM' });
  const playerUser = await createTestUser({ displayName: 'Import Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  playerEmail = playerUser.email;
  sourceCampaignId = (await createTestCampaign(dmId, { name: 'Round Trip' })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId: sourceCampaignId, role: 'DM', characterIds: [] } });

  const mapFile = path.join(UPLOAD_DIR, 'source-map.png');
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(mapFile, PNG);
  const asset = await prisma.asset.create({
    data: {
      type: 'MAP', scope: 'CAMPAIGN', campaignId: sourceCampaignId, uploadedById: dmId, filename: 'source-map.png',
      originalName: 'Keep.png', mimeType: 'image/png', fileSize: PNG.length, filePath: mapFile, name: 'Keep',
    },
  });
  await prisma.map.create({
    data: {
      campaignId: sourceCampaignId, name: 'The Keep', imageUrl: `/api/assets/maps/${asset.id}`, baseLayerUrl: `/api/assets/maps/${asset.id}`,
      width: 20, height: 15, gridSize: 50, annotations: [],
      tokens: [{ id: 't1', name: 'Goblin', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token', visible: true }],
    },
  });

  dm = await signIn(dmUser.email);
  player = await signIn(playerUser.email);

  const res = await dm.get(`/api/campaigns/${sourceCampaignId}/export`).buffer(true).parse((r, done) => {
    const chunks: Buffer[] = [];
    r.on('data', (c: Buffer) => chunks.push(c));
    r.on('end', () => done(null, Buffer.concat(chunks)));
  });
  expect(res.status).toBe(200);
  exported = path.join(SCRATCH, 'round-trip.cozyvtt');
  fs.writeFileSync(exported, res.body as Buffer);
}, 60_000);

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: { in: [dmId, playerId] } } });
  await prisma.campaign.deleteMany({ where: { ownerId: { in: [dmId, playerId] } } });
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

describe('POST /api/campaigns/import/preview', () => {
  it('describes an exported campaign without creating anything', async () => {
    const before = await prisma.campaign.count({ where: { ownerId: playerId } });
    const res = await player.post('/api/campaigns/import/preview').attach('file', exported);

    expect(res.status).toBe(200);
    expect(res.body.preview).toMatchObject({ campaignName: 'Round Trip', mapCount: 1, tokenCount: 1, assetCount: 1 });
    expect(await prisma.campaign.count({ where: { ownerId: playerId } })).toBe(before);
    expect(tempFiles()).toEqual([]);
  });

  it('refuses a visitor who is not signed in', async () => {
    const res = await request(app).post('/api/campaigns/import/preview').attach('file', exported);
    expect(res.status).toBe(401);
  });

  it('refuses an archive with no manifest', async () => {
    const file = path.join(SCRATCH, 'no-manifest.cozyvtt');
    await writeZip(file, [{ name: 'campaign.json', data: '{"name":"x"}' }]);
    const res = await player.post('/api/campaigns/import/preview').attach('file', file);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid archive: missing manifest.json');
  });

  it('refuses a file that is not an archive, saying so', async () => {
    const file = path.join(SCRATCH, 'not-a-zip.cozyvtt');
    fs.writeFileSync(file, 'this is not a zip file at all, just text');
    const res = await player.post('/api/campaigns/import/preview').attach('file', file);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('The file is not a ZIP archive, or it is damaged.');
    expect(tempFiles()).toEqual([]);
  });
});

describe('POST /api/campaigns/import', () => {
  it('lets a player import an exported campaign, as its owner and DM', async () => {
    const res = await player.post('/api/campaigns/import').field('campaignName', 'My Copy').attach('file', exported);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ campaignName: 'My Copy', mapCount: 1, tokenCount: 1 });
    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: res.body.campaignId },
      include: { maps: true, memberships: true, assets: true },
    });
    expect(campaign.ownerId).toBe(playerId);
    expect(campaign.memberships).toEqual([expect.objectContaining({ userId: playerId, role: 'DM' })]);
    expect(campaign.maps).toHaveLength(1);
    expect(campaign.assets).toHaveLength(1);
    expect(fs.readFileSync(path.resolve(campaign.assets[0].filePath))).toEqual(PNG);
    expect(campaign.maps[0].imageUrl).toBe(`/api/assets/maps/${campaign.assets[0].id}`);
    expect(tempFiles()).toEqual([]);
  });

  it('refuses a campaign name over 200 characters, leaving nothing behind', async () => {
    const before = await prisma.campaign.count({ where: { ownerId: playerId } });
    const res = await player.post('/api/campaigns/import').field('campaignName', 'x'.repeat(201)).attach('file', exported);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Campaign name must be between 1 and 200 characters.');
    expect(await prisma.campaign.count({ where: { ownerId: playerId } })).toBe(before);
    expect(tempFiles()).toEqual([]);
  });

  it('refuses an archive with an entry that leaves its folder, creating nothing', async () => {
    const file = path.join(SCRATCH, 'slip.cozyvtt');
    await writeZip(file, [
      { name: 'manifest.json', data: manifest },
      { name: 'campaign.json', data: '{"name":"Slip"}' },
      { name: 'xx/escape.png', data: PNG },
    ]);
    renameEntry(file, 'xx/escape.png', '../escape.png');
    const before = await prisma.campaign.count({ where: { ownerId: playerId } });

    const res = await player.post('/api/campaigns/import').attach('file', file);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Unsafe file path detected: ../escape.png');
    expect(await prisma.campaign.count({ where: { ownerId: playerId } })).toBe(before);
    expect(fs.existsSync(path.join(UPLOAD_DIR, '..', 'escape.png'))).toBe(false);
  });

  // nginx and the backend both answer 413 for a body too large to take, and
  // the import window explains that status. The backend used to say 400.
  it('answers 413 for an archive over 500 MB, saying so, and keeps none of it', async () => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    const login = await request(app).post('/api/auth/login').send({ email: playerEmail, password: TEST_PASSWORD });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const boundary = '----CozyTooLarge';
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="huge.cozyvtt"\r\nContent-Type: application/zip\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const fileBytes = 500 * 1024 * 1024 + 1024;
    const chunk = Buffer.alloc(1024 * 1024);

    try {
      const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1', port, path: '/api/campaigns/import/preview', method: 'POST',
            headers: { Cookie: cookie, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': head.length + fileBytes + tail.length },
          },
          (answer) => {
            const chunks: Buffer[] = [];
            answer.on('data', (c: Buffer) => chunks.push(c));
            answer.on('end', () => resolve({ status: answer.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
          }
        );
        req.on('error', reject);
        req.write(head);
        let left = fileBytes;
        const pump = () => {
          while (left > 0) {
            const piece = left >= chunk.length ? chunk : chunk.subarray(0, left);
            left -= piece.length;
            if (!req.write(piece)) {
              req.once('drain', pump);
              return;
            }
          }
          req.end(tail);
        };
        pump();
      });

      expect(res.status).toBe(413);
      expect(JSON.parse(res.body)).toEqual({
        error: 'File Too Large',
        message: 'The archive is larger than 500 MB, the most a campaign archive may be.',
      });
      expect(tempFiles()).toEqual([]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 120_000);

  it('clears archives and staging folders a stopped server left in its temporary folder', async () => {
    fs.mkdirSync(IMPORT_TEMP, { recursive: true });
    const stale = path.join(IMPORT_TEMP, 'left-behind.cozyvtt');
    const staleStaging = path.join(IMPORT_TEMP, 'left-behind.staging');
    const recent = path.join(IMPORT_TEMP, 'in-progress.cozyvtt');
    fs.writeFileSync(stale, 'old');
    fs.mkdirSync(staleStaging);
    fs.writeFileSync(path.join(staleStaging, 'picture.png'), PNG);
    fs.writeFileSync(recent, 'new');
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    fs.utimesSync(stale, twoDaysAgo, twoDaysAgo);
    fs.utimesSync(staleStaging, twoDaysAgo, twoDaysAgo);

    const res = await player.post('/api/campaigns/import/preview').attach('file', exported);
    expect(res.status).toBe(200);
    // The clearing runs beside the upload; give it a moment.
    for (let waited = 0; (fs.existsSync(stale) || fs.existsSync(staleStaging)) && waited < 2000; waited += 50) {
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(staleStaging)).toBe(false);
    expect(fs.existsSync(recent)).toBe(true);
    fs.rmSync(recent);
  });

  // PostgreSQL cannot store a NUL character, so this map's row is refused by
  // the database itself once the campaign and the map before it are written.
  it('answers 500 with no database detail when a campaign cannot be saved, and keeps none of it', async () => {
    const file = path.join(SCRATCH, 'nul.cozyvtt');
    const map = (name: string) => JSON.stringify({ name, width: 5, height: 5, gridSize: 50, feetPerSquare: 5, tokens: [] });
    await writeZip(file, [
      { name: 'manifest.json', data: manifest.replace('"mapCount":0', '"mapCount":2') },
      { name: 'campaign.json', data: '{"name":"Crafted"}' },
      { name: 'maps/map-0.json', data: map('Fine') },
      { name: 'maps/map-1.json', data: map('Not\u0000fine') },
    ]);
    const before = await prisma.campaign.count({ where: { ownerId: playerId } });

    const res = await player.post('/api/campaigns/import').attach('file', file);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'Import Failed',
      message: 'The campaign could not be saved, so nothing was imported. The server log has the details.',
    });
    expect(await prisma.campaign.count({ where: { ownerId: playerId } })).toBe(before);
    expect(tempFiles()).toEqual([]);
  });

  it('refuses an archive whose data cannot be unpacked, saying it is damaged', async () => {
    const file = path.join(SCRATCH, 'damaged.cozyvtt');
    await writeZip(file, [
      { name: 'manifest.json', data: manifest },
      { name: 'campaign.json', data: JSON.stringify({ name: 'Damaged', description: 'x'.repeat(2000) }) },
    ]);
    // Overwrite the start of campaign.json's packed bytes, after its local
    // header's name and extra field, with a block type deflate does not have.
    const bytes = fs.readFileSync(file);
    const nameAt = bytes.indexOf(Buffer.from('campaign.json'));
    const dataAt = nameAt + 'campaign.json'.length + bytes.readUInt16LE(nameAt - 2);
    bytes.fill(0xff, dataAt, dataAt + 16);
    fs.writeFileSync(file, bytes);

    const res = await player.post('/api/campaigns/import').attach('file', file);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('The archive is damaged: campaign.json cannot be read.');
  });
});
