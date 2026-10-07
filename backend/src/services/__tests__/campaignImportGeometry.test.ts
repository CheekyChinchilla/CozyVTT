/**
 * A campaign archive's walls and lights are held to the bounds every other
 * path that stores them applies: no coordinate past 250,000 pixels, and
 * nothing more than 500 squares outside the map. An archive is a file anyone
 * can write, and a map whose geometry is outside them is skipped like any
 * other map that fails validation, instead of storing a wall that freezes
 * sight for the whole server.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import archiver from 'archiver';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { importCampaign } from '../campaignImporter';
import { prisma, createTestUser, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';

async function zipOf(entries: Record<string, string>): Promise<Buffer> {
  const archive = archiver('zip');
  const chunks: Buffer[] = [];
  archive.on('data', (chunk: Buffer) => chunks.push(chunk));
  const ended = new Promise<void>((resolve, reject) => {
    archive.on('end', () => resolve());
    archive.on('error', reject);
  });
  for (const [name, body] of Object.entries(entries)) archive.append(body, { name });
  await archive.finalize();
  await ended;
  return Buffer.concat(chunks);
}

/** A map 20 by 20 squares at 50 px: 1,000 px square, with 25,000 px of margin. */
const map = (name: string, geometry: { walls?: unknown[]; lights?: unknown[] }) => ({
  name, width: 20, height: 20, gridSize: 50, feetPerSquare: 5, tokens: [],
  wallSegments: geometry.walls ?? [], lights: geometry.lights ?? [],
});
const wall = (x2: number) => ({ id: randomUUID(), x1: 100, y1: 100, x2, y2: 100, type: 'wall' });
const light = (x: number) => ({ id: randomUUID(), x, y: 500, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true });

function archive(maps: object[]): Promise<Buffer> {
  const entries: Record<string, string> = {
    'manifest.json': JSON.stringify({
      formatVersion: 1, exportedAt: new Date().toISOString(), exportedFrom: 'test', campaignName: 'Geometry',
      gameSystem: 'DND_5E', mapCount: maps.length, tokenCount: 0, creatureCount: 0, tokenTemplateCount: 0,
      assetCount: 0, includesAudio: false, totalSizeBytes: 0,
    }),
    'campaign.json': JSON.stringify({ name: 'Geometry' }),
  };
  maps.forEach((m, i) => { entries[`maps/map-${i}.json`] = JSON.stringify(m); });
  return zipOf(entries);
}

/** The importer reads an archive from disk, as the import route saves it. */
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-import-geometry-'));
function onDisk(zip: Buffer): string {
  const file = path.join(SCRATCH, `${randomUUID()}.cozyvtt`);
  fs.writeFileSync(file, zip);
  return file;
}

let userId: string;
const campaigns: string[] = [];

beforeAll(async () => {
  userId = (await createTestUser({ email: `import-geometry-${Date.now()}@test.cozyvtt.local` })).id;
});

afterAll(async () => {
  await cleanupCampaigns(campaigns);
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

it('imports the maps whose walls and lights are in bounds, and skips the rest', async () => {
  const zip = await archive([
    map('Tidy', { walls: [wall(300), wall(1400)], lights: [light(600)] }),
    map('Wall ten million pixels away', { walls: [wall(1e7)] }),
    map('Wall far off the map', { walls: [wall(1000 + 25000 + 50)] }),
    map('Light far off the map', { lights: [light(1000 + 25000 + 50)] }),
  ]);

  const result = await importCampaign(onDisk(zip), userId);
  campaigns.push(result.campaignId);

  const maps = await prisma.map.findMany({ where: { campaignId: result.campaignId }, select: { name: true, wallSegments: true } });
  expect(maps.map((m) => m.name)).toEqual(['Tidy']);
  expect(maps[0].wallSegments).toHaveLength(2);
});
