/**
 * What a campaign archive's creatures, templates, game systems, fog and
 * nested data import as.
 *
 * The importer took any text as a game system and handed it to the
 * database, which refused it, so an archive whose creature named its system
 * "dnd5e" stopped the import part-way with the database's own message. It
 * held stat blocks to looser limits than the creature editor and the token
 * routes, so an imported creature could be stored that could then neither be
 * placed on a map nor saved. It stored a map's fog as it arrived, and it
 * never checked how deeply the archive's data nested, though its header said
 * it did.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-import-shapes-'));
process.env.UPLOAD_DIR = path.join(SCRATCH, 'uploads');

import { importCampaign, jsonNestsDeeperThan, jsonListCut, jsonHoldsMoreValuesThan } from '../campaignImporter';
import { NpcStatBlockSchema } from '../../validators/statBlock';
import { prisma, createTestUser, cleanupUsers } from '../../__tests__/helpers/db';
import { writeZip, type FixtureEntry } from '../../__tests__/helpers/zipFixtures';

const statBlock = (fields: Record<string, unknown> = {}) => ({
  ac: 12, speed: '30 ft.', abilities: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 }, ...fields,
});
const creature = (fields: Record<string, unknown> = {}) => ({ name: 'Bandit', gameSystem: 'DND_5E', statBlock: statBlock(), ...fields });
const template = (fields: Record<string, unknown> = {}) => ({ name: 'Guard', type: 'npc', statBlock: statBlock(), ...fields });
const token = (fields: Record<string, unknown> = {}) => ({ name: 'Goblin', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, ...fields });
const map = (fields: Record<string, unknown> = {}) => ({ name: 'Cellar', width: 10, height: 10, gridSize: 50, feetPerSquare: 5, tokens: [], ...fields });

interface Contents {
  campaign?: Record<string, unknown>;
  maps?: object[];
  creatures?: object[];
  templates?: object[];
  /** Replace a data file's text as it is written. */
  raw?: Record<string, string>;
}

async function archive(contents: Contents): Promise<string> {
  const file = path.join(SCRATCH, `${randomUUID()}.cozyvtt`);
  const maps = contents.maps ?? [];
  const files: Record<string, string> = {
    'manifest.json': JSON.stringify({
      formatVersion: 1, exportedAt: '2026-10-06T00:00:00.000Z', exportedFrom: 'CozyVTT v1.5.0', campaignName: 'Shapes',
      gameSystem: 'DND_5E', mapCount: maps.length, tokenCount: 0, creatureCount: contents.creatures?.length ?? 0,
      tokenTemplateCount: contents.templates?.length ?? 0, assetCount: 0, includesAudio: false, totalSizeBytes: 0,
    }),
    'campaign.json': JSON.stringify({ name: 'Shapes', gameSystem: 'DND_5E', ...contents.campaign }),
  };
  maps.forEach((m, i) => { files[`maps/map-${i}.json`] = JSON.stringify(m); });
  if (contents.creatures) files['creatures/creatures.json'] = JSON.stringify(contents.creatures);
  if (contents.templates) files['token-templates/templates.json'] = JSON.stringify(contents.templates);
  Object.assign(files, contents.raw);
  const entries: FixtureEntry[] = Object.entries(files).map(([name, data]) => ({ name, data }));
  await writeZip(file, entries);
  return file;
}

let userId: string;

beforeAll(async () => {
  userId = (await createTestUser({ displayName: 'Import Shapes' })).id;
});

afterAll(async () => {
  await prisma.campaign.deleteMany({ where: { ownerId: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

describe('a game system the server does not know', () => {
  it('on a creature, imports the creature with none, and the rest of the archive', async () => {
    const result = await importCampaign(
      await archive({ maps: [map()], creatures: [creature({ gameSystem: 'dnd5e' }), creature({ name: 'Wolf' })] }),
      userId
    );

    expect(result).toMatchObject({ mapCount: 1, creatureCount: 2 });
    const creatures = await prisma.creatureTemplate.findMany({ where: { campaignId: result.campaignId }, orderBy: { name: 'asc' } });
    expect(creatures.map((c) => [c.name, c.gameSystem])).toEqual([['Bandit', null], ['Wolf', 'DND_5E']]);
    expect(result.warnings).toEqual(['Creature "Bandit": its game system "dnd5e" is not one this server knows, so it was imported with none.']);
  });

  it("on the campaign, imports the campaign with none", async () => {
    const result = await importCampaign(await archive({ campaign: { gameSystem: 'STARFINDER' }, maps: [map()] }), userId);

    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: result.campaignId } });
    expect(campaign.gameSystem).toBeNull();
    expect(result.warnings).toEqual(['The campaign\'s game system "STARFINDER" is not one this server knows, so it was imported with none.']);
  });
});

describe('a stat block over the limits the creature editor applies', () => {
  const long = 'L'.repeat(6000);

  it('is cut down to them, so the creature can be placed and saved', async () => {
    const result = await importCampaign(
      await archive({ creatures: [creature({ statBlock: statBlock({ actions: [{ name: 'Bite', description: long }] }) })] }),
      userId
    );

    const [stored] = await prisma.creatureTemplate.findMany({ where: { campaignId: result.campaignId } });
    expect(NpcStatBlockSchema.safeParse(stored.statBlock).success).toBe(true);
    expect((stored.statBlock as { actions: Array<{ description: string }> }).actions[0].description).toBe('L'.repeat(5000));
    expect(result.warnings).toEqual(['Creature "Bandit": shortened text or lists in its stat block to what the creature editor keeps.']);
  });

  it('is cut down on a token template and on a map token too', async () => {
    const block = statBlock({ traits: Array.from({ length: 60 }, (_, i) => ({ name: `T${i}`, description: 'x' })) });
    const result = await importCampaign(
      await archive({ templates: [template({ statBlock: block })], maps: [map({ tokens: [token({ statBlock: block })] })] }),
      userId
    );

    const [stored] = await prisma.tokenTemplate.findMany({ where: { campaignId: result.campaignId } });
    expect(NpcStatBlockSchema.safeParse(stored.statBlock).success).toBe(true);
    const [storedMap] = await prisma.map.findMany({ where: { campaignId: result.campaignId } });
    const [storedToken] = storedMap.tokens as Array<{ statBlock: unknown }>;
    expect(NpcStatBlockSchema.safeParse(storedToken.statBlock).success).toBe(true);
    expect((storedToken.statBlock as { traits: unknown[] }).traits).toHaveLength(50);
  });

  it('that cannot be cut down leaves out the creature, which needs one, with the reason', async () => {
    const result = await importCampaign(await archive({ creatures: [creature({ statBlock: statBlock({ ac: 150 }) })] }), userId);

    expect(result.creatureCount).toBe(0);
    expect(result.skipped).toEqual([{ kind: 'creature', name: 'Bandit', reason: expect.stringContaining('statBlock.ac') }]);
  });

  it('that cannot be cut down is left off a template or token, which keep the rest', async () => {
    const block = statBlock({ ac: 150 });
    const result = await importCampaign(
      await archive({ templates: [template({ statBlock: block })], maps: [map({ tokens: [token({ statBlock: block })] })] }),
      userId
    );

    expect(result).toMatchObject({ tokenTemplateCount: 1, tokenCount: 1, skipped: [] });
    const [stored] = await prisma.tokenTemplate.findMany({ where: { campaignId: result.campaignId } });
    expect(stored.statBlock).toBeNull();
    expect(result.warnings).toEqual([
      'Map "Cellar": left the stat block off 1 token, which the app cannot store; the token was kept.',
      'Token template "Guard": left off its stat block, which the app cannot store; the template was kept.',
    ]);
  });
});

describe('a map\'s fog', () => {
  it('that is not fog the server keeps is not stored', async () => {
    const result = await importCampaign(await archive({ maps: [map({ fogData: { fogCols: 10, revealed: 'all of it' } })] }), userId);

    const [stored] = await prisma.map.findMany({ where: { campaignId: result.campaignId } });
    expect(stored.fogData).toBeNull();
  });

  it('that matches the map is kept as it was', async () => {
    const fogData = { fogCols: 10, fogRows: 10, cellPx: 50, revealed: Array.from({ length: 100 }, (_, i) => i < 10) };
    const result = await importCampaign(await archive({ maps: [map({ fogData })] }), userId);

    const [stored] = await prisma.map.findMany({ where: { campaignId: result.campaignId } });
    expect(stored.fogData).toEqual(fogData);
  });
});

describe('data nested deeper than an export ever writes', () => {
  const nested = (depth: number): unknown => (depth === 0 ? 'deep' : { next: nested(depth - 1) });

  it('leaves out the map that holds it, with the reason', async () => {
    const result = await importCampaign(
      await archive({ maps: [map({ name: 'Deep', annotations: [nested(40)] }), map({ name: 'Shallow' })] }),
      userId
    );

    expect(result.mapCount).toBe(1);
    expect(result.skipped).toEqual([{ kind: 'map', name: 'Map 1', reason: 'Its data nests more than 32 levels deep, far deeper than CozyVTT ever writes.' }]);
  });

  it('refuses the archive when it is in the campaign settings', async () => {
    await expect(
      importCampaign(await archive({ campaign: { vibeSettings: { periods: [], extra: nested(40) } } }), userId)
    ).rejects.toThrow('campaign.json in the archive nests more than 32 levels deep, far deeper than CozyVTT ever writes. It may be damaged, or not a CozyVTT export.');
  });
});

// A map file may unpack to 10 MB. Filled with tiny walls or empty objects it
// holds over a million values, and parsing it cost several times what the
// largest map an export writes does (a 500 by 500 fog, 1,000 tokens and
// 5,000 walls hold about 330,000). Such a map is left out before it is parsed.
describe('a map holding more values than an export ever writes', () => {
  it('is left out, with the reason, and the others imported', async () => {
    const walls = Array.from({ length: 1_000_001 }, () => 0);
    const result = await importCampaign(
      await archive({ maps: [map({ name: 'Crowded', wallSegments: walls }), map({ name: 'Plain' })] }),
      userId
    );

    expect(result.mapCount).toBe(1);
    expect(result.skipped).toEqual([{ kind: 'map', name: 'Map 1', reason: 'It holds more than 1,000,000 values, far more than CozyVTT ever writes for one map.' }]);
  });
});

describe('jsonHoldsMoreValuesThan', () => {
  it('counts the values and members outside strings, and stops at the limit', () => {
    expect(jsonHoldsMoreValuesThan('[1,2,3]', 3)).toBe(false);
    expect(jsonHoldsMoreValuesThan('[1,2,3,4]', 3)).toBe(true);
    expect(jsonHoldsMoreValuesThan('{"a":1,"b":[2,3]}', 3)).toBe(false);
    expect(jsonHoldsMoreValuesThan(JSON.stringify({ note: 'a, b, c, d, e' }), 1)).toBe(false);
    expect(jsonHoldsMoreValuesThan(JSON.stringify({ note: 'a \\" , , , ,' }), 1)).toBe(false);
  });
});

describe('jsonNestsDeeperThan', () => {
  it('counts objects and lists, and nothing inside a string', () => {
    expect(jsonNestsDeeperThan('{"a":[{"b":1}]}', 3)).toBe(false);
    expect(jsonNestsDeeperThan('{"a":[{"b":[1]}]}', 3)).toBe(true);
    expect(jsonNestsDeeperThan(JSON.stringify({ note: '[[[[[[{{{{{{' }), 1)).toBe(false);
    expect(jsonNestsDeeperThan(JSON.stringify({ note: 'a \\" quote [[[[' }), 1)).toBe(false);
  });
});

// The counts were lifted to what the 10 MB list allows, and a list of 65,000
// minimal creatures stopped the server. An archive carries up to 2,000 of
// each; the rest are left out and listed, as they were at the old caps.
describe('a list longer than an archive may carry', () => {
  it('imports the first 2,000 creatures and lists the rest as left out', async () => {
    const creatures = Array.from({ length: 2050 }, (_, i) => creature({ name: `Bandit ${i}` }));
    const result = await importCampaign(await archive({ creatures }), userId);
    expect(result.creatureCount).toBe(2000);
    expect(result.skipped).toEqual([
      { kind: 'creature', name: '50 creatures', reason: 'An archive can carry 2,000 creatures. These were the last in its list.' },
    ]);
    const stored = await prisma.creatureTemplate.findMany({ where: { campaignId: result.campaignId }, select: { name: true } });
    expect(stored).toHaveLength(2000);
    expect(stored.some((c) => c.name === 'Bandit 1999')).toBe(true);
    expect(stored.some((c) => c.name === 'Bandit 2000')).toBe(false);
  });

  it('imports the first 2,000 token templates and lists the rest as left out', async () => {
    const templates = Array.from({ length: 2001 }, (_, i) => template({ name: `Guard ${i}` }));
    const result = await importCampaign(await archive({ templates }), userId);
    expect(result.tokenTemplateCount).toBe(2000);
    expect(result.skipped).toEqual([
      { kind: 'tokenTemplate', name: '1 token template', reason: 'An archive can carry 2,000 token templates. These were the last in its list.' },
    ]);
  });
});

describe('jsonListCut', () => {
  it('counts a list\'s items and finds where the last one kept ends', () => {
    const text = ' [ {"a":[1,2]}, "x,]", 3 , {"b":"}"} ] ';
    expect(jsonListCut(text, 2)).toEqual({ items: 4, cutAt: text.indexOf(', 3') });
    expect(JSON.parse(`${text.slice(0, jsonListCut(text, 2)!.cutAt!)}]`)).toEqual([{ a: [1, 2] }, 'x,]']);
  });

  it('cuts nothing from a list at or under the limit', () => {
    expect(jsonListCut('[1,2]', 2)).toEqual({ items: 2, cutAt: null });
    expect(jsonListCut('[]', 2)).toEqual({ items: 0, cutAt: null });
  });

  it('is null for text that is not a list', () => {
    expect(jsonListCut('{"a":1}', 2)).toBeNull();
  });
});
