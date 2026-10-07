/**
 * A campaign archive imports everything the app can store, and says what it
 * changed or left out.
 *
 * The importer held maps to limits of its own: at most 500 tokens, a token
 * name of 200 characters and notes of 5,000, and walls and lights inside the
 * map's reach. One value past any of them refused the whole map, walls, fog
 * and tokens with it, and the result still reported the archive's map
 * count. The app allows 1,000 tokens on a map, and earlier versions stored
 * names and notes of any length, so an ordinary campaign could lose maps on
 * the way to a new server. Now a value that can be cut down is cut down, one
 * token or wall the app cannot store is left out on its own, and only a map
 * the app could not hold is left out whole. The result lists each.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-import-fidelity-'));
const UPLOAD_DIR = path.join(SCRATCH, 'uploads');
process.env.UPLOAD_DIR = UPLOAD_DIR;

// The real file-type is ESM-only; this knows a PNG.
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

import { importCampaign } from '../campaignImporter';
import { prepareCampaignExport } from '../campaignExporter';
import { prisma, createTestUser, createTestCampaign, cleanupUsers } from '../../__tests__/helpers/db';
import { writeZip, type FixtureEntry } from '../../__tests__/helpers/zipFixtures';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface StoredToken {
  id: string;
  name: string;
  notes?: string | null;
  position: { x: number; y: number };
  size: { width: number; height: number };
  imageUrl: string;
}
interface StoredWall { id: string; x1: number; y1: number; x2: number; y2: number; type: string }
interface StoredLight { id: string; x: number; y: number; brightRadius: number; dimRadius: number; color: string; enabled: boolean }

let userId: string;

beforeAll(async () => {
  userId = (await createTestUser({ displayName: 'Import Fidelity' })).id;
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await prisma.campaign.deleteMany({ where: { ownerId: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

async function importedMaps(campaignId: string) {
  return prisma.map.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } });
}

// ── A round trip through the exporter ───────────────────────────────────────

describe('a campaign exported and imported again', () => {
  it('comes back whole at the limits the app allows', async () => {
    const source = await createTestCampaign(userId, { name: 'At the limits' });
    await prisma.campaignMembership.create({ data: { userId, campaignId: source.id, role: 'DM', characterIds: [] } });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const pictureFile = path.join(UPLOAD_DIR, 'source.png');
    fs.writeFileSync(pictureFile, PNG);
    const picture = await prisma.asset.create({
      data: {
        type: 'MAP', scope: 'CAMPAIGN', campaignId: source.id, uploadedById: userId, filename: 'source.png',
        originalName: 'Hall.png', mimeType: 'image/png', fileSize: PNG.length, filePath: pictureFile, name: 'Hall',
      },
    });
    // 1,000 tokens fill a 40 by 25 map one to a square, each with a name
    // and notes as long as the token routes allow.
    const tokens = Array.from({ length: 1000 }, (_, i) => ({
      id: randomUUID(),
      name: `${String(i).padStart(4, '0')}${'n'.repeat(196)}`,
      notes: `${i}:${'w'.repeat(5000 - String(i).length - 1)}`,
      imageUrl: '',
      position: { x: i % 40, y: Math.floor(i / 40) },
      size: { width: 1, height: 1 },
      layer: i % 10 === 0 ? 'spirit' : 'token',
      visible: i % 7 !== 0,
      type: 'npc',
      disposition: 'hostile',
      displayMode: 'pog',
    }));
    const walls: StoredWall[] = [
      { id: randomUUID(), x1: 0, y1: 0, x2: 2560, y2: 0, type: 'wall' },
      { id: randomUUID(), x1: 256, y1: 256, x2: 512, y2: 256, type: 'door-locked' },
      // Past the map's edge, as a Universal VTT import can put one.
      { id: randomUUID(), x1: -512, y1: 0, x2: 0, y2: 0, type: 'window' },
    ];
    const lights: StoredLight[] = [{ id: randomUUID(), x: 1280, y: 640, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true }];
    const fogData = { fogCols: 40, fogRows: 25, cellPx: 256, revealed: Array.from({ length: 1000 }, (_, i) => i % 3 === 0) };
    await prisma.map.create({
      data: {
        campaignId: source.id, name: 'h'.repeat(200), imageUrl: `/api/assets/maps/${picture.id}`, baseLayerUrl: `/api/assets/maps/${picture.id}`,
        width: 40, height: 25, gridSize: 256, feetPerSquare: 100, diagonalRule: 'alternating', tokens, annotations: [],
        wallSegments: walls as unknown as object[], lights: lights as unknown as object[], fogData,
        lightingEnabled: true, fogEnabled: true, globalIllumination: false, explorationEnabled: false,
      },
    });

    const file = path.join(SCRATCH, 'limits.cozyvtt');
    const prepared = await prepareCampaignExport(source.id, { userId, isAdmin: false });
    await prepared.writeTo(fs.createWriteStream(file));

    const result = await importCampaign(file, userId);

    expect(result).toMatchObject({ mapCount: 1, tokenCount: 1000, warnings: [], skipped: [] });
    const [map] = await importedMaps(result.campaignId);
    expect(map).toMatchObject({
      name: 'h'.repeat(200), width: 40, height: 25, gridSize: 256, feetPerSquare: 100, diagonalRule: 'alternating',
      lightingEnabled: true, fogEnabled: true, globalIllumination: false, explorationEnabled: false, fogData,
    });
    expect(map.imageUrl).toMatch(/^\/api\/assets\/maps\//);
    const stored = map.tokens as unknown as StoredToken[];
    expect(stored.map((t) => [t.name, t.notes, t.position])).toEqual(tokens.map((t) => [t.name, t.notes, t.position]));
    const storedWalls = map.wallSegments as unknown as StoredWall[];
    expect(storedWalls.map(({ id: _id, ...w }) => w)).toEqual(walls.map(({ id: _id, ...w }) => w));
    const storedLights = map.lights as unknown as StoredLight[];
    expect(storedLights.map(({ id: _id, ...l }) => l)).toEqual(lights.map(({ id: _id, ...l }) => l));
  }, 60_000);
});

// ── Archives as other versions wrote them, or as anyone could ─────────────

const PICTURE_ID = '66666666-6666-4666-8666-666666666666';

const token = (fields: Record<string, unknown> = {}) => ({
  name: 'Goblin', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, ...fields,
});
const map = (fields: Record<string, unknown> = {}) => ({
  name: 'Cellar', imageAssetRef: null, width: 10, height: 10, gridSize: 50, feetPerSquare: 5, tokens: [token()], ...fields,
});

/** An archive of these maps, and optionally assets, written to disk as the import route saves one. */
async function archive(maps: object[], assets: Record<string, { entry?: FixtureEntry; info: object }> = {}): Promise<string> {
  const file = path.join(SCRATCH, `${randomUUID()}.cozyvtt`);
  const entries: FixtureEntry[] = [
    {
      name: 'manifest.json',
      data: JSON.stringify({
        formatVersion: 1, exportedAt: '2026-10-06T00:00:00.000Z', exportedFrom: 'CozyVTT v1.4.0', campaignName: 'Older',
        gameSystem: 'DND_5E', mapCount: maps.length, tokenCount: 0, creatureCount: 0, tokenTemplateCount: 0,
        assetCount: Object.keys(assets).length, includesAudio: false, totalSizeBytes: 0,
      }),
    },
    { name: 'campaign.json', data: JSON.stringify({ name: 'Older', gameSystem: 'DND_5E' }) },
    { name: 'assets/asset-manifest.json', data: JSON.stringify(Object.fromEntries(Object.entries(assets).map(([id, a]) => [id, a.info]))) },
    ...Object.values(assets).flatMap((a) => (a.entry ? [a.entry] : [])),
    ...maps.map((m, i) => ({ name: `maps/map-${i}.json`, data: JSON.stringify(m) })),
  ];
  await writeZip(file, entries);
  return file;
}

describe('a token over the limits the token routes apply', () => {
  it('has its name and notes cut down instead of costing the map', async () => {
    const result = await importCampaign(
      await archive([map({ tokens: [token({ name: 'G'.repeat(300), notes: 'N'.repeat(6000) }), token({ name: 'Orc' })] })]),
      userId
    );

    expect(result.mapCount).toBe(1);
    const [stored] = await importedMaps(result.campaignId);
    const tokens = stored.tokens as unknown as StoredToken[];
    expect(tokens.map((t) => t.name)).toEqual(['G'.repeat(200), 'Orc']);
    expect(tokens[0].notes).toBe('N'.repeat(5000));
    expect(result.warnings).toEqual([
      'Map "Cellar": shortened the names of 1 token to 200 characters.',
      'Map "Cellar": shortened the notes of 1 token to 5,000 characters.',
    ]);
    expect(result.skipped).toEqual([]);
  });

  it('keeps a token whose notes are empty', async () => {
    const result = await importCampaign(await archive([map({ tokens: [token({ notes: null })] })]), userId);
    expect(result.tokenCount).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it('is moved onto a whole square inside the map', async () => {
    const result = await importCampaign(
      await archive([map({ tokens: [token({ position: { x: 2.4, y: 3.6 } }), token({ position: { x: 40, y: -3 }, size: { width: 2, height: 2 } })] })]),
      userId
    );

    const [stored] = await importedMaps(result.campaignId);
    expect((stored.tokens as unknown as StoredToken[]).map((t) => t.position)).toEqual([{ x: 2, y: 4 }, { x: 8, y: 0 }]);
    expect(result.warnings).toEqual(['Map "Cellar": moved 2 tokens onto whole squares inside the map.']);
  });

  it('is left out on its own, and listed, when it cannot be stored at all', async () => {
    const result = await importCampaign(await archive([map({ tokens: [token(), token({ name: 'Ghost', position: 'nowhere' })] })]), userId);

    expect(result.tokenCount).toBe(1);
    expect(result.skipped).toEqual([
      { kind: 'token', name: '"Ghost" on "Cellar"', reason: expect.stringContaining('position') },
    ]);
  });
});

describe('a map with more tokens than a map can hold', () => {
  it('keeps the first 1,000 and lists the rest', async () => {
    const tokens = Array.from({ length: 1003 }, (_, i) => token({ name: `T${i}`, position: { x: i % 40, y: Math.floor(i / 40) } }));
    const result = await importCampaign(await archive([map({ width: 40, height: 30, tokens })]), userId);

    expect(result.tokenCount).toBe(1000);
    const [stored] = await importedMaps(result.campaignId);
    expect((stored.tokens as unknown as StoredToken[]).at(-1)?.name).toBe('T999');
    expect(result.skipped).toEqual([
      { kind: 'token', name: '3 tokens on "Cellar"', reason: 'A map can hold 1,000 tokens. These were the last in its list.' },
    ]);
  });
});

describe('walls and lights', () => {
  it('get new ids, so two that shared one stay two', async () => {
    const shared = 'not-a-uuid';
    const result = await importCampaign(
      await archive([map({
        wallSegments: [
          { id: shared, x1: 0, y1: 0, x2: 100, y2: 0, type: 'wall' },
          { id: shared, x1: 0, y1: 50, x2: 100, y2: 50, type: 'door-closed' },
        ],
        lights: [
          { id: shared, x: 10, y: 10, brightRadius: 1, dimRadius: 2, color: '#ffcc66', enabled: true },
          { id: shared, x: 20, y: 20, brightRadius: 1, dimRadius: 2, color: '#ffcc66', enabled: false },
        ],
      })]),
      userId
    );

    const [stored] = await importedMaps(result.campaignId);
    const ids = [...(stored.wallSegments as unknown as StoredWall[]), ...(stored.lights as unknown as StoredLight[])].map((x) => x.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(id).toMatch(UUID);
  });

  it('are left out one at a time when the app cannot store them, keeping the map', async () => {
    const result = await importCampaign(
      await archive([map({
        wallSegments: [
          { id: 'a', x1: 0, y1: 0, x2: 100, y2: 0, type: 'wall' },
          { id: 'b', x1: 0, y1: 0, x2: 1e7, y2: 0, type: 'wall' },
          { id: 'c', x1: 0, y1: 0, x2: 500 + 25000 + 50, y2: 0, type: 'wall' },
          { id: 'd', x1: 0, y1: 0, x2: 100, y2: 100, type: 'portcullis' },
        ],
        lights: [
          { id: 'e', x: 10, y: 10, brightRadius: 3, dimRadius: 2, color: '#ffcc66', enabled: true },
          { id: 'f', x: 10, y: 10, brightRadius: 1, dimRadius: 2, color: '#ffcc66', enabled: true },
        ],
      })]),
      userId
    );

    expect(result.mapCount).toBe(1);
    const [stored] = await importedMaps(result.campaignId);
    expect((stored.wallSegments as unknown as StoredWall[]).map((w) => w.x2)).toEqual([100]);
    expect(stored.lights).toHaveLength(1);
    expect(result.warnings).toEqual([
      'Map "Cellar": left out 2 walls or doors the app cannot store.',
      'Map "Cellar": left out 1 wall or door more than 500 squares outside the map.',
      'Map "Cellar": left out 1 light the app cannot store.',
    ]);
  });
});

describe('a map the app could not hold', () => {
  it('is listed with the reason, and only the maps made are counted', async () => {
    const result = await importCampaign(await archive([map({ name: 'Vast', width: 600 }), map({ name: 'Hall' })]), userId);

    expect(result.mapCount).toBe(1);
    expect((await importedMaps(result.campaignId)).map((m) => m.name)).toEqual(['Hall']);
    expect(result.skipped).toEqual([
      { kind: 'map', name: 'Vast', reason: 'Map width must be a whole number from 1 to 500 squares' },
    ]);
  });

  it('is listed when its file is missing from the archive', async () => {
    const manifest = path.join(SCRATCH, `${randomUUID()}.cozyvtt`);
    // An archive claiming a second map it does not carry.
    await writeZip(manifest, [
      { name: 'manifest.json', data: JSON.stringify({ formatVersion: 1, exportedAt: 'x', exportedFrom: 'x', campaignName: 'x', gameSystem: 'NONE', mapCount: 2, tokenCount: 0, creatureCount: 0, tokenTemplateCount: 0, assetCount: 0, includesAudio: false, totalSizeBytes: 0 }) },
      { name: 'campaign.json', data: JSON.stringify({ name: 'Missing' }) },
      { name: 'maps/map-0.json', data: JSON.stringify(map({ name: 'Hall' })) },
    ]);

    const result = await importCampaign(manifest, userId);

    expect(result.mapCount).toBe(1);
    expect(result.skipped).toEqual([{ kind: 'map', name: 'Map 2', reason: 'Its file is missing from the archive.' }]);
  });
});

describe('a map name over 200 characters', () => {
  it('is cut down, and the map imported', async () => {
    const result = await importCampaign(await archive([map({ name: 'M'.repeat(250) })]), userId);

    const [stored] = await importedMaps(result.campaignId);
    expect(stored.name).toBe('M'.repeat(200));
    expect(result.warnings).toEqual([`Map "${'M'.repeat(80)}…": shortened its name to 200 characters.`]);
  });
});

describe('an asset the import leaves out', () => {
  it('is listed with the reason, and what used it arrives without it', async () => {
    const result = await importCampaign(
      await archive([map({ imageAssetRef: PICTURE_ID })], {
        [PICTURE_ID]: {
          info: { originalName: 'cave.png', mimeType: 'image/png', type: 'MAP', fileSize: 10 },
          entry: { name: `assets/${PICTURE_ID}.png`, data: Buffer.from('not a picture at all') },
        },
        '77777777-7777-4777-8777-777777777777': { info: { originalName: 'gone.png', mimeType: 'image/png', type: 'TOKEN', fileSize: 10 } },
        '88888888-8888-4888-8888-888888888888': { info: { originalName: 'rules.pdf', mimeType: 'application/pdf', type: 'DOCUMENT', fileSize: 10 } },
      }),
      userId
    );

    expect(result.mapCount).toBe(1);
    expect(result.skipped).toEqual([
      { kind: 'asset', name: 'cave.png', reason: 'Its content is not a format a map picture can be (.png, .jpg, .jpeg, .webp).' },
      { kind: 'asset', name: 'gone.png', reason: 'Its file is missing from the archive.' },
      { kind: 'asset', name: 'rules.pdf', reason: 'A campaign archive carries map pictures, token pictures and audio, and this is none of them.' },
    ]);
  });
});

// ── Order ───────────────────────────────────────────────────────────────────

describe('the order of an imported campaign\'s maps and pictures', () => {
  it('follows the original: the Map Library lists the maps as it did, and no two share a time', async () => {
    const source = await createTestCampaign(userId, { name: 'In order' });
    await prisma.campaignMembership.create({ data: { userId, campaignId: source.id, role: 'DM', characterIds: [] } });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const made = Date.parse('2026-01-01T00:00:00.000Z');
    const maps = [];
    for (const [i, name] of ['Act I', 'Act II', 'Act III'].entries()) {
      const file = path.join(UPLOAD_DIR, `order-${i}.png`);
      fs.writeFileSync(file, PNG);
      const picture = await prisma.asset.create({
        data: {
          type: 'MAP', scope: 'CAMPAIGN', campaignId: source.id, uploadedById: userId, filename: `order-${i}.png`,
          originalName: `${name}.png`, mimeType: 'image/png', fileSize: PNG.length, filePath: file, name, createdAt: new Date(made + i * 1000),
        },
      });
      maps.push(await prisma.map.create({
        data: {
          campaignId: source.id, name, imageUrl: `/api/assets/maps/${picture.id}`, baseLayerUrl: `/api/assets/maps/${picture.id}`,
          width: 10, height: 10, tokens: [], annotations: [], createdAt: new Date(made + i * 1000),
        },
      }));
    }
    // Editing the first map moves its row to the end of the table.
    await prisma.map.update({ where: { id: maps[0].id }, data: { name: 'Act I' } });

    const file = path.join(SCRATCH, 'order.cozyvtt');
    await (await prepareCampaignExport(source.id, { userId, isAdmin: false })).writeTo(fs.createWriteStream(file));
    const result = await importCampaign(file, userId);

    const imported = await prisma.map.findMany({ where: { campaignId: result.campaignId }, orderBy: { createdAt: 'desc' } });
    expect(imported.map((m) => m.name)).toEqual(['Act III', 'Act II', 'Act I']);
    expect(new Set(imported.map((m) => m.createdAt.getTime())).size).toBe(3);
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: result.campaignId } });
    expect(campaign.currentMapId).toBe(imported[2].id);
    const pictures = await prisma.asset.findMany({ where: { campaignId: result.campaignId } });
    expect(new Set(pictures.map((a) => a.createdAt.getTime())).size).toBe(3);
  });
});
