/**
 * What a campaign archive carries of drawing on the map.
 *
 * The campaign's Players may draw goes with it, so a DM who turned it off
 * finds it off after moving the campaign to another server; an archive from
 * before the setting existed imports with it on, as every campaign was at
 * the upgrade.
 *
 * A map's drawings travel in its file's `drawings`, in drawing order and
 * without their authors, a drawing for the DM alone still the DM's. Its
 * `annotations` is written empty: releases up to 1.5.4 store an archive's
 * annotations and send them to every member, and drop a key they do not
 * know, so an archive made here and imported there carries no drawing to
 * its players. An import holds each drawing to what `drawing:add` takes and
 * to the map's region, and a map to the drawings and points its markup
 * layer holds, leaving out and counting the rest. The annotations an older
 * archive carried, `[]` or records of another shape that nothing drew, are
 * read the same way: what is not a drawing is left out and counted, and the
 * map imports. Map files are written without indentation, so a map holding
 * all the drawing, fog and walls it may fits in the 10 MB a file of an
 * archive may hold and imports whole.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-archive-drawings-'));
process.env.UPLOAD_DIR = path.join(SCRATCH, 'uploads');

import { importCampaign } from '../campaignImporter';
import { prepareCampaignExport } from '../campaignExporter';
import { prisma, createTestUser, createTestCampaign, cleanupUsers } from '../../__tests__/helpers/db';
import { writeZip } from '../../__tests__/helpers/zipFixtures';
import { openArchiveFile, readArchiveEntry, UnpackedTotal } from '../../utils/archive';
import { DRAWING_LIMITS } from '../../validators/drawingLimits';

jest.setTimeout(120000);

let userId: string;

beforeAll(async () => {
  userId = (await createTestUser({ displayName: 'Archive Drawings' })).id;
});

afterAll(async () => {
  await prisma.campaign.deleteMany({ where: { ownerId: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

/** A campaign of the user's, with one empty map, as the DM. */
async function campaign(name: string) {
  const source = await createTestCampaign(userId, { name });
  await prisma.campaignMembership.create({ data: { userId, campaignId: source.id, role: 'DM', characterIds: [] } });
  const map = await prisma.map.create({
    data: { campaignId: source.id, name: 'Plan', imageUrl: '', baseLayerUrl: '', width: 20, height: 20, gridSize: 50, tokens: [], annotations: [] },
  });
  return { campaignId: source.id, mapId: map.id };
}

/** Export the campaign and import the archive again, as the same user. */
async function roundTrip(campaignId: string) {
  const file = path.join(SCRATCH, `${campaignId}.cozyvtt`);
  const prepared = await prepareCampaignExport(campaignId, { userId, isAdmin: false });
  await prepared.writeTo(fs.createWriteStream(file));
  return { file, result: await importCampaign(file, userId) };
}

describe('Players may draw', () => {
  it('comes back off when it was off', async () => {
    const { campaignId } = await campaign('Players kept from drawing');
    await prisma.campaign.update({ where: { id: campaignId }, data: { playersMayDraw: false } });
    const { result } = await roundTrip(campaignId);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: result.campaignId } })).playersMayDraw).toBe(false);
  });

  it('is on for an archive from before the setting', async () => {
    const file = path.join(SCRATCH, 'before-the-setting.cozyvtt');
    await writeZip(file, [
      {
        name: 'manifest.json',
        data: JSON.stringify({
          formatVersion: 1, exportedAt: '2026-10-25T12:00:00.000Z', exportedFrom: 'CozyVTT v1.5.4', campaignName: 'Older',
          gameSystem: 'NONE', mapCount: 0, tokenCount: 0, creatureCount: 0, tokenTemplateCount: 0, assetCount: 0,
          includesAudio: false, totalSizeBytes: 0,
        }),
      },
      { name: 'campaign.json', data: JSON.stringify({ name: 'Older', description: null, gameSystem: null, vibeSettings: { periods: [] } }) },
      { name: 'assets/asset-manifest.json', data: '{}' },
    ]);
    const result = await importCampaign(file, userId);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: result.campaignId } })).playersMayDraw).toBe(true);
  });
});

/** A map file of an archive, as text. */
async function mapFile(file: string, index = 0): Promise<string> {
  const directory = await openArchiveFile(file, 100);
  const entry = directory.files.find((f) => f.path === `maps/map-${index}.json`);
  if (!entry) throw new Error(`no maps/map-${index}.json in the archive`);
  return (await readArchiveEntry(file, entry, { maxEntryBytes: 64 * 1024 * 1024, total: new UnpackedTotal(64 * 1024 * 1024) })).toString('utf8');
}

/** A one-map archive whose map file is `map`, as an export of 1.5.4 or a script would write it. */
async function oneMapArchive(name: string, map: Record<string, unknown>): Promise<string> {
  const file = path.join(SCRATCH, `${name}.cozyvtt`);
  await writeZip(file, [
    {
      name: 'manifest.json',
      data: JSON.stringify({
        formatVersion: 1, exportedAt: '2026-10-25T12:00:00.000Z', exportedFrom: 'CozyVTT v1.5.4', campaignName: name,
        gameSystem: 'NONE', mapCount: 1, tokenCount: 0, creatureCount: 0, tokenTemplateCount: 0, assetCount: 0,
        includesAudio: false, totalSizeBytes: 0,
      }),
    },
    { name: 'campaign.json', data: JSON.stringify({ name, description: null, gameSystem: null, vibeSettings: { periods: [] } }) },
    {
      name: 'maps/map-0.json',
      data: JSON.stringify({
        name: 'Plan', imageAssetRef: null, width: 20, height: 20, gridSize: 50, feetPerSquare: 5, tokens: [], wallSegments: [], lights: [],
        ...map,
      }),
    },
    { name: 'assets/asset-manifest.json', data: '{}' },
  ]);
  return file;
}

const importedDrawings = async (campaignId: string) => {
  const [map] = await prisma.map.findMany({ where: { campaignId } });
  return { map, drawings: await prisma.mapDrawing.findMany({ where: { mapId: map.id }, orderBy: [{ sortKey: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] }) };
};

const kept = (d: Record<string, unknown>) => ({
  audience: d.audience, layer: d.layer, kind: d.kind, color: d.color, fillColor: d.fillColor, width: d.width,
  rotation: d.rotation, sortKey: d.sortKey, points: d.points, text: d.text,
});

describe('the drawings on a map', () => {
  it('come back in their order, one for the DM alone still the DM\'s, with new ids and no author', async () => {
    const { campaignId, mapId } = await campaign('Drawn on');
    const make = (data: Record<string, unknown>) =>
      prisma.mapDrawing.create({ data: { mapId, authorId: userId, kind: 'line', color: '#3d8bd9', width: 3, points: [[0, 0], [10, 10]], ...data } });
    const made = [
      await make({ sortKey: 4, kind: 'polygon', points: [[0, 0], [100, 0], [50, 80]], fillColor: '#e8a33c', width: 2 }),
      await make({ sortKey: -2, audience: 'DM', kind: 'text', points: [[40, 40]], text: 'The vault is here', rotation: 90 }),
      await make({}),
    ];
    const { file, result } = await roundTrip(campaignId);

    expect(result.warnings).toEqual([]);
    const { map, drawings } = await importedDrawings(result.campaignId);
    const byOrder = [made[1], made[2], made[0]];
    expect(drawings.map(kept)).toEqual(byOrder.map(kept));
    for (const d of drawings) {
      expect(d.authorId).toBeNull();
      expect(made.map((m) => m.id)).not.toContain(d.id);
    }
    expect(map.annotations).toEqual([]);

    // The archive carries the drawings under `drawings`, without their
    // authors, its `annotations` empty though one is for the DM alone, and
    // writes map files without indentation.
    const text = await mapFile(file);
    expect(text).not.toMatch(/\n/);
    const written = JSON.parse(text) as { annotations: unknown[]; drawings: Array<Record<string, unknown>> };
    expect(written.annotations).toEqual([]);
    expect(written.drawings).toEqual(byOrder.map(kept));
    expect(written.drawings.some((d) => d.audience === 'DM')).toBe(true);
  });

  it('are none for a map an archive from 1.5.4 carried, with its empty annotations and no drawings', async () => {
    const result = await importCampaign(await oneMapArchive('From 1.5.4', { annotations: [] }), userId);
    expect(result).toMatchObject({ mapCount: 1, warnings: [], skipped: [] });
    expect((await importedDrawings(result.campaignId)).drawings).toEqual([]);
  });

  it('leave out annotations of another shape, one at a time, and keep the map', async () => {
    const result = await importCampaign(await oneMapArchive('Other shape', {
      annotations: [
        { id: 'note', type: 'circle', position: { x: 1, y: 1 }, color: '#ff0000', text: 'The trap' },
        { kind: 'line', color: '#3d8bd9', width: 3, points: [[0, 0], [10, 10]] },
      ],
    }), userId);
    expect(result).toMatchObject({ mapCount: 1, skipped: [] });
    expect(result.warnings).toEqual(['Map "Plan": left out 1 drawing the app cannot store.']);
    expect((await importedDrawings(result.campaignId)).drawings.map((d) => d.kind)).toEqual(['line']);
  });

  it('leave out annotations or drawings that are not a list, keeping the map', async () => {
    const result = await importCampaign(await oneMapArchive('Not a list', { annotations: { trap: true }, drawings: 'pen' }), userId);
    expect(result.warnings).toEqual([
      'Map "Plan": left out its drawings, which could not be read.',
      'Map "Plan": left out its annotations, which could not be read.',
    ]);
    expect(result.mapCount).toBe(1);
  });

  it('leave out a drawing on the ground layer, one for a kind not drawn yet, and one too far outside the map', async () => {
    const line = { kind: 'line', color: '#3d8bd9', width: 3, points: [[0, 0], [10, 10]] };
    const result = await importCampaign(await oneMapArchive('Out of bounds', {
      drawings: [line, { ...line, layer: 'GROUND' }, { ...line, kind: 'stamp' }, { ...line, points: [[0, 0], [26001, 0]] }],
    }), userId);
    // 20 squares of 50 pixels, and 500 squares of margin: 26,000 is the edge.
    expect(result.warnings).toEqual([
      'Map "Plan": left out 2 drawings the app cannot store.',
      'Map "Plan": left out 1 drawing more than 500 squares outside the map.',
    ]);
    expect((await importedDrawings(result.campaignId)).drawings).toHaveLength(1);
  });

  it('are cut at the most a map\'s markup layer holds, drawings and points, and the cut counted', async () => {
    const line = (i: number) => ({ kind: 'line', color: '#3d8bd9', width: 1, points: [[i % 900, 0], [i % 900, 10]] });
    const tooMany = await importCampaign(await oneMapArchive('Too many', {
      drawings: Array.from({ length: DRAWING_LIMITS.maxMarkupPerMap + 3 }, (_, i) => line(i)),
    }), userId);
    expect(tooMany.warnings).toEqual([`Map "Plan": left out the last 3 drawings: a map holds ${DRAWING_LIMITS.maxMarkupPerMap.toLocaleString('en-US')} on its markup layer.`]);
    expect((await importedDrawings(tooMany.campaignId)).drawings).toHaveLength(DRAWING_LIMITS.maxMarkupPerMap);

    const stroke = { kind: 'pen', color: '#3d8bd9', width: 1, points: Array.from({ length: DRAWING_LIMITS.maxPoints }, (_, i) => [i % 900, Math.floor(i / 900)]) };
    const strokes = DRAWING_LIMITS.maxMarkupPointsPerMap / DRAWING_LIMITS.maxPoints;
    const tooMuch = await importCampaign(await oneMapArchive('Too much', {
      drawings: [...Array.from({ length: strokes }, () => stroke), stroke, line(1)],
    }), userId);
    expect(tooMuch.warnings).toEqual([`Map "Plan": left out 2 drawings past the ${DRAWING_LIMITS.maxMarkupPointsPerMap.toLocaleString('en-US')} points a map holds on its markup layer.`]);
    expect((await importedDrawings(tooMuch.campaignId)).drawings).toHaveLength(strokes);
  });

  it('of a map holding all the drawing it may, with a full fog and 5,000 walls, export under 10 MB and import whole', async () => {
    const { campaignId, mapId } = await campaign('As full as a map gets');
    await prisma.map.update({
      where: { id: mapId },
      data: {
        width: 500, height: 500, gridSize: 50,
        fogData: { fogCols: 500, fogRows: 500, cellPx: 50, revealed: Array.from({ length: 250000 }, (_, i) => i % 2 === 0) },
        wallSegments: Array.from({ length: 5000 }, (_, i) => ({ id: randomUUID(), x1: 24000 + i, y1: 24000, x2: 24001 + i, y2: 24999, type: 'wall' })),
      },
    });
    const perDrawing = DRAWING_LIMITS.maxMarkupPointsPerMap / DRAWING_LIMITS.maxMarkupPerMap;
    await prisma.mapDrawing.createMany({
      data: Array.from({ length: DRAWING_LIMITS.maxMarkupPerMap }, (_, d) => ({
        mapId, authorId: userId, kind: 'pen', color: '#3d8bd9', width: 3,
        points: Array.from({ length: perDrawing }, (_, i) => [-24999 + d * 12 + i, 24999 - i]),
      })),
    });

    const { file, result } = await roundTrip(campaignId);

    expect(Buffer.byteLength(await mapFile(file))).toBeLessThan(10 * 1024 * 1024);
    expect(result).toMatchObject({ mapCount: 1, warnings: [], skipped: [] });
    const { drawings } = await importedDrawings(result.campaignId);
    expect(drawings).toHaveLength(DRAWING_LIMITS.maxMarkupPerMap);
    expect(drawings.reduce((sum, d) => sum + (d.points as unknown[]).length, 0)).toBe(DRAWING_LIMITS.maxMarkupPointsPerMap);
  });
});
