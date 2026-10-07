/**
 * Archives exported by CozyVTT 1.4.0 and 1.5.0 still import whole.
 *
 * Each archive here is built the way that version's exporter wrote one,
 * from what that version stored: 1.4.0 kept token notes and names of any
 * length and had no fog, lighting or exploration flags on a map; both
 * recorded a picture's format as the browser declared it, and 1.5.0's
 * "Include audio assets" wrote no sound while saying it had.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-import-older-'));
process.env.UPLOAD_DIR = path.join(SCRATCH, 'uploads');

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
import { NpcStatBlockSchema } from '../../validators/statBlock';
import { prisma, createTestUser, cleanupUsers } from '../../__tests__/helpers/db';
import { writeZip } from '../../__tests__/helpers/zipFixtures';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);
const MAP_PICTURE = '90376235-4c14-4eb7-8ea1-354ae4a0c8ee';
const GOBLIN_PICTURE = '244d57ad-5dcc-4fcb-8d6a-09f8ccfd6ac7';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const statBlock = {
  ac: 15, hpMax: 7, speed: '30 ft.', abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  actions: [{ name: 'Scimitar', description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.' }],
  challengeRating: '1/4',
};

/** A token as the token routes of the version stored it, and its exporter wrote it. */
function storedToken(version: '1.4.0' | '1.5.0', fields: Record<string, unknown>) {
  const token: Record<string, unknown> = {
    id: randomUUID(), name: 'Goblin', imageUrl: GOBLIN_PICTURE, position: { x: 3, y: 4 }, size: { width: 1, height: 1 },
    layer: 'token', visible: true, rotation: 0, conditions: ['Prone'], metadata: {}, type: 'npc', disposition: 'hostile',
    hp: { current: 7, max: 7, temp: 0 }, showHpBar: true, notes: '', initiative: null, displayMode: 'pog', statBlock,
    creatureTemplateId: null,
  };
  if (version === '1.5.0') Object.assign(token, { sightRadius: 12, obscured: false });
  return { ...token, ...fields };
}

const walls = [
  { id: randomUUID(), x1: 70, x2: 350, y1: 140, y2: 140, type: 'wall' },
  { id: randomUUID(), x1: 350, x2: 350, y1: 140, y2: 280, type: 'door-closed' },
];
const lights = [{ x: 350, y: 350, id: randomUUID(), color: '#88aaff', enabled: true, dimRadius: 6, brightRadius: 3 }];
const fogData = { fogCols: 24, fogRows: 24, cellPx: 70, revealed: Array.from({ length: 576 }, (_, i) => i < 48) };

async function archive(version: '1.4.0' | '1.5.0', map: Record<string, unknown>, vibeSettings: unknown): Promise<string> {
  const file = path.join(SCRATCH, `${version}-${randomUUID()}.cozyvtt`);
  const manifestEntry = (id: string, originalName: string, type: string) => [
    id, { originalName, mimeType: 'text/plain', type, fileSize: PNG.length },
  ];
  await writeZip(file, [
    {
      name: 'manifest.json',
      data: JSON.stringify({
        formatVersion: 1, exportedAt: '2026-09-14T12:00:00.000Z', exportedFrom: `CozyVTT v${version}`, campaignName: 'The Sunken Crown',
        gameSystem: 'DND_5E', mapCount: 1, tokenCount: (map.tokens as unknown[]).length, creatureCount: 1, tokenTemplateCount: 1,
        assetCount: 2, includesAudio: version === '1.5.0', totalSizeBytes: PNG.length * 2,
      }, null, 2),
    },
    {
      name: 'campaign.json',
      data: JSON.stringify({
        name: 'The Sunken Crown', description: 'A drowned crown.', gameSystem: 'DND_5E', vibeSettings, currentVibe: null,
        spiritLayerEnabled: true, spiritLayerStyle: 'wispy',
      }, null, 2),
    },
    { name: 'maps/map-0.json', data: JSON.stringify(map, null, 2) },
    {
      name: 'creatures/creatures.json',
      data: JSON.stringify([{
        name: 'Drowned Sailor', gameSystem: 'DND_5E', challengeRating: '1/4', creatureType: 'Medium undead', alignment: 'neutral evil',
        imageAssetRef: GOBLIN_PICTURE, statBlock, size: { width: 1, height: 1 }, disposition: 'hostile', displayMode: 'pog',
      }]),
    },
    {
      name: 'token-templates/templates.json',
      data: JSON.stringify([{
        name: 'Harbour Guard', imageAssetRef: GOBLIN_PICTURE, type: 'npc', disposition: 'neutral', displayMode: 'pog',
        size: { width: 1, height: 1 }, notes: 'Bribable.', hp: { current: 11, max: 11, temp: 0 }, showHpBar: false, statBlock, sightRadius: 0,
      }]),
    },
    {
      name: 'assets/asset-manifest.json',
      data: JSON.stringify(Object.fromEntries([manifestEntry(MAP_PICTURE, 'vault.png', 'MAP'), manifestEntry(GOBLIN_PICTURE, 'goblin.png', 'TOKEN')])),
    },
    { name: `assets/${MAP_PICTURE}.png`, data: PNG, store: true },
    { name: `assets/${GOBLIN_PICTURE}.png`, data: PNG, store: true },
  ]);
  return file;
}

const baseMap = {
  name: 'Drowned Chapel', imageAssetRef: MAP_PICTURE, spiritLayerAssetRef: null, width: 24, height: 24, gridSize: 70,
  feetPerSquare: 5, diagonalRule: 'flat', annotations: [], wallSegments: walls, fogData, lightingEnabled: true, lights,
};

let userId: string;

beforeAll(async () => {
  userId = (await createTestUser({ displayName: 'Import Older' })).id;
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await prisma.campaign.deleteMany({ where: { ownerId: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

async function imported(campaignId: string) {
  return prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { maps: true, assets: true, creatureTemplates: true, tokenTemplates: true },
  });
}

function expectWholeMap(map: { wallSegments: unknown; lights: unknown; fogData: unknown; imageUrl: string }, pictureId: string) {
  const storedWalls = map.wallSegments as Array<Record<string, unknown>>;
  expect(storedWalls.map(({ id: _id, ...w }) => w)).toEqual(walls.map(({ id: _id, ...w }) => w));
  for (const wall of storedWalls) expect(wall.id).toMatch(UUID);
  expect((map.lights as Array<Record<string, unknown>>).map(({ id: _id, ...l }) => l)).toEqual(lights.map(({ id: _id, ...l }) => l));
  expect(map.fogData).toEqual(fogData);
  expect(map.imageUrl).toBe(`/api/assets/maps/${pictureId}`);
}

describe('an archive exported by 1.4.0', () => {
  it('imports whole, with a long token note cut down and the map flags it had no word for left on', async () => {
    const tokens = [
      storedToken('1.4.0', { notes: 'Ledger of the drowned. '.repeat(300) }),
      storedToken('1.4.0', { name: 'Spirit of the Bell', layer: 'spirit', position: { x: 10, y: 12 } }),
    ];
    const vibe = { enabled: true, periods: [{ name: 'Night', hue: '#223366', filter: 'brightness(0.6)', audio: 'church bells, faint' }] };

    const result = await importCampaign(await archive('1.4.0', { ...baseMap, tokens }, vibe), userId);

    expect(result).toMatchObject({ mapCount: 1, tokenCount: 2, creatureCount: 1, tokenTemplateCount: 1, skipped: [] });
    expect(result.warnings).toEqual(['Map "Drowned Chapel": shortened the notes of 1 token to 5,000 characters.']);
    const campaign = await imported(result.campaignId);
    expect(campaign.assets.map((a) => [a.originalName, a.mimeType]).sort()).toEqual([['goblin.png', 'image/png'], ['vault.png', 'image/png']]);
    const [map] = campaign.maps;
    expect(map).toMatchObject({ lightingEnabled: true, fogEnabled: true, globalIllumination: true, explorationEnabled: true });
    expectWholeMap(map, campaign.assets.find((a) => a.originalName === 'vault.png')!.id);
    const stored = map.tokens as Array<Record<string, unknown>>;
    expect(stored.map((t) => [t.name, t.layer, t.position, t.obscured])).toEqual([
      ['Goblin', 'token', { x: 3, y: 4 }, false],
      ['Spirit of the Bell', 'spirit', { x: 10, y: 12 }, false],
    ]);
    expect((stored[0].notes as string).length).toBe(5000);
    expect(stored[0].imageUrl).toBe(`/api/assets/tokens/${campaign.assets.find((a) => a.originalName === 'goblin.png')!.id}`);
    expect(NpcStatBlockSchema.safeParse(campaign.creatureTemplates[0].statBlock).success).toBe(true);
    expect(campaign.tokenTemplates[0]).toMatchObject({ name: 'Harbour Guard', notes: 'Bribable.' });
    // A free-text note from before periods named an audio file is no track.
    expect((campaign.vibeSettings as { periods: Array<{ audio: unknown }> }).periods[0].audio).toBeNull();
  });
});

describe('an archive exported by 1.5.0', () => {
  it('imports whole, and says which atmosphere tracks it did not carry', async () => {
    const tokens = [storedToken('1.5.0', { obscured: true }), storedToken('1.5.0', { name: 'Orc', position: { x: 5, y: 5 }, visible: false })];
    const vibe = {
      enabled: true,
      periods: [
        { hue: '#ffcc88', name: 'Dawn', audio: '011dee96-f200-4734-b200-4f23dc63930f', filter: 'brightness(1.05) saturate(1.1)' },
        { hue: '#ffffff', name: 'Day', audio: null, filter: 'none' },
        { hue: '#223366', name: 'Night', audio: 'ffaa3d4a-7ba0-4eed-acfb-cf9245cabfe2', filter: 'brightness(0.6) saturate(0.8)' },
      ],
    };
    const map = { ...baseMap, tokens, fogEnabled: true, globalIllumination: false, explorationEnabled: false };

    const result = await importCampaign(await archive('1.5.0', map, vibe), userId);

    expect(result).toMatchObject({ mapCount: 1, tokenCount: 2, creatureCount: 1, tokenTemplateCount: 1, skipped: [] });
    expect(result.warnings).toEqual([
      "The archive holds no track for the atmosphere's Dawn and Night periods, so they have none. Export with Include audio assets ticked to bring tracks across.",
    ]);
    const campaign = await imported(result.campaignId);
    const [stored] = campaign.maps;
    expect(stored).toMatchObject({ lightingEnabled: true, fogEnabled: true, globalIllumination: false, explorationEnabled: false });
    expectWholeMap(stored, campaign.assets.find((a) => a.originalName === 'vault.png')!.id);
    expect((stored.tokens as Array<Record<string, unknown>>).map((t) => [t.name, t.obscured, t.visible, t.sightRadius])).toEqual([
      ['Goblin', true, true, 12],
      ['Orc', false, false, 12],
    ]);
    expect(campaign).toMatchObject({ spiritLayerEnabled: true, spiritLayerStyle: 'wispy', gameSystem: 'DND_5E' });
  });
});
