/**
 * "Include audio assets" puts a campaign's sound in its archive, and an
 * import plays it again.
 *
 * Sound files are used only by the atmosphere: each time-of-day period's
 * track and the ambient track. The export collected assets from maps,
 * tokens, creatures and templates alone, so the option included nothing
 * while the archive said it had, and an import then cleared every period's
 * track and the ambient one.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-archive-audio-'));
const UPLOAD_DIR = path.join(SCRATCH, 'uploads');
process.env.UPLOAD_DIR = UPLOAD_DIR;

// The real file-type is ESM-only; this knows an Ogg file.
jest.mock('file-type', () => {
  const sniff = (head: Buffer) => (head.subarray(0, 4).toString('latin1') === 'OggS' ? { ext: 'ogg', mime: 'audio/ogg' } : undefined);
  return {
    fileTypeFromBuffer: async (buf: Buffer) => sniff(buf),
    fileTypeFromFile: async (file: string) => {
      const { readFileSync } = jest.requireActual<typeof import('fs')>('fs');
      return sniff(readFileSync(file).subarray(0, 16));
    },
  };
});

import unzipper from 'unzipper';
import { importCampaign } from '../campaignImporter';
import { prepareCampaignExport } from '../campaignExporter';
import { prisma, createTestUser, createTestCampaign, cleanupUsers } from '../../__tests__/helpers/db';

const OGG = Buffer.concat([Buffer.from('OggS', 'latin1'), Buffer.alloc(256, 1)]);

interface Period { name: string; audio: string | null }
interface Vibe { periods: Period[]; atmosphereAudio?: { assetId: string; volume: number; loop: boolean } | null }

let userId: string;
let sourceId: string;
let nightTrackId: string;
let ambientTrackId: string;

async function track(name: string): Promise<string> {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const file = path.join(UPLOAD_DIR, `${name}.ogg`);
  fs.writeFileSync(file, OGG);
  const asset = await prisma.asset.create({
    data: {
      type: 'AUDIO', scope: 'CAMPAIGN', campaignId: sourceId, uploadedById: userId, filename: `${name}.ogg`,
      originalName: `${name}.ogg`, mimeType: 'audio/ogg', fileSize: OGG.length, filePath: file, name,
    },
  });
  return asset.id;
}

/** Export the source campaign to a file and return its path. */
async function exportSource(includeAudio: boolean): Promise<string> {
  const file = path.join(SCRATCH, `export-${includeAudio}.cozyvtt`);
  const prepared = await prepareCampaignExport(sourceId, { userId, isAdmin: false }, { includeAudio });
  await prepared.writeTo(fs.createWriteStream(file));
  return file;
}

async function readManifest(file: string): Promise<{ includesAudio: boolean; assetCount: number }> {
  const directory = await unzipper.Open.file(file);
  const entry = directory.files.find((f) => f.path === 'manifest.json');
  return JSON.parse((await entry!.buffer()).toString());
}

beforeAll(async () => {
  userId = (await createTestUser({ displayName: 'Archive Audio' })).id;
  sourceId = (await createTestCampaign(userId, { name: 'Sounds' })).id;
  await prisma.campaignMembership.create({ data: { userId, campaignId: sourceId, role: 'DM', characterIds: [] } });
  nightTrackId = await track('crickets');
  ambientTrackId = await track('rain');
  await prisma.campaign.update({
    where: { id: sourceId },
    data: {
      vibeSettings: {
        enabled: true,
        periods: [
          { name: 'Day', hue: '#ffffff', filter: 'none', audio: null },
          { name: 'Night', hue: '#223366', filter: 'brightness(0.6)', audio: nightTrackId },
        ],
        atmosphereAudio: { assetId: ambientTrackId, volume: 0.3, loop: false },
      },
    },
  });
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await prisma.campaign.deleteMany({ where: { ownerId: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

describe('a campaign exported with audio', () => {
  it('carries its period and ambient tracks, and says so', async () => {
    const manifest = await readManifest(await exportSource(true));
    expect(manifest).toMatchObject({ includesAudio: true, assetCount: 2 });
  });

  it('imports with each period and the ambient track playing the imported copies', async () => {
    const result = await importCampaign(await exportSource(true), userId);

    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: result.campaignId }, include: { assets: true } });
    const tracks = campaign.assets.filter((a) => a.type === 'AUDIO');
    expect(tracks.map((a) => a.originalName).sort()).toEqual(['crickets.ogg', 'rain.ogg']);
    const byName = Object.fromEntries(tracks.map((a) => [a.originalName, a.id]));
    const vibe = campaign.vibeSettings as unknown as Vibe;
    expect(vibe.periods.map((p) => [p.name, p.audio])).toEqual([['Day', null], ['Night', byName['crickets.ogg']]]);
    expect(vibe.atmosphereAudio).toEqual({ assetId: byName['rain.ogg'], volume: 0.3, loop: false });
    expect(result.warnings).toEqual([]);
  });
});

describe('a campaign exported without audio', () => {
  it('carries no tracks, and says so', async () => {
    const manifest = await readManifest(await exportSource(false));
    expect(manifest).toMatchObject({ includesAudio: false, assetCount: 0 });
  });

  it('imports with no tracks, since it has none to name, and says so', async () => {
    const result = await importCampaign(await exportSource(false), userId);

    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: result.campaignId } });
    const vibe = campaign.vibeSettings as unknown as Vibe;
    expect(vibe.periods.map((p) => p.audio)).toEqual([null, null]);
    expect(vibe.atmosphereAudio ?? null).toBeNull();
    expect(result.warnings).toEqual([
      "The archive holds no track for the atmosphere's Night period, so it has none. Export with Include audio assets ticked to bring tracks across.",
      'The archive holds no file for the ambient track, so none is playing. Export with Include audio assets ticked to bring it across.',
    ]);
  });
});
