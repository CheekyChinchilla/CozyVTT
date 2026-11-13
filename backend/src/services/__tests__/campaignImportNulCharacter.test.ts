/**
 * A campaign archive's text holding U+0000, the null character.
 *
 * PostgreSQL cannot store the character, in a text column or in a jsonb
 * one, in a value or a key, so one of them anywhere in an archive, in a map's
 * name or a key of a creature's stat block, failed the whole import with
 * "The campaign could not be saved". Every data file is now read without
 * it, as text over its limit is cut to fit, and the import says how many it
 * removed from which file.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-import-nul-'));
process.env.UPLOAD_DIR = path.join(SCRATCH, 'uploads');

import { importCampaign } from '../campaignImporter';
import { prisma, createTestUser, cleanupUsers } from '../../__tests__/helpers/db';
import { writeZip, type FixtureEntry } from '../../__tests__/helpers/zipFixtures';

const statBlock = (fields: Record<string, unknown> = {}) => ({
  ac: 12, speed: '30 ft.', abilities: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 }, ...fields,
});
const map = (fields: Record<string, unknown> = {}) => ({ name: 'Cellar', width: 10, height: 10, gridSize: 50, feetPerSquare: 5, tokens: [], ...fields });

async function archive(contents: { campaign?: Record<string, unknown>; maps?: object[]; creatures?: object[]; templates?: object[] }): Promise<string> {
  const file = path.join(SCRATCH, `${randomUUID()}.cozyvtt`);
  const maps = contents.maps ?? [];
  const files: Record<string, string> = {
    'manifest.json': JSON.stringify({
      formatVersion: 1, exportedAt: '2026-11-01T00:00:00.000Z', exportedFrom: 'CozyVTT test', campaignName: 'Nul',
      gameSystem: 'FIFTH_EDITION', mapCount: maps.length, tokenCount: 0, creatureCount: contents.creatures?.length ?? 0,
      tokenTemplateCount: contents.templates?.length ?? 0, assetCount: 0, includesAudio: false, totalSizeBytes: 0,
    }),
    'campaign.json': JSON.stringify({ name: 'Nul', gameSystem: 'FIFTH_EDITION', ...contents.campaign }),
  };
  maps.forEach((m, i) => { files[`maps/map-${i}.json`] = JSON.stringify(m); });
  if (contents.creatures) files['creatures/creatures.json'] = JSON.stringify(contents.creatures);
  if (contents.templates) files['token-templates/templates.json'] = JSON.stringify(contents.templates);
  const entries: FixtureEntry[] = Object.entries(files).map(([name, data]) => ({ name, data }));
  await writeZip(file, entries);
  return file;
}

let userId: string;

beforeAll(async () => {
  userId = (await createTestUser({ displayName: 'Import Nul' })).id;
});

afterAll(async () => {
  await prisma.campaign.deleteMany({ where: { ownerId: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

describe('an archive whose text holds U+0000', () => {
  it("imports a campaign's name and description without it", async () => {
    const result = await importCampaign(await archive({ campaign: { name: 'Nul\u0000', description: 'Under\u0000 the hill' } }), userId);

    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: result.campaignId } });
    expect([campaign.name, campaign.description]).toEqual(['Nul', 'Under the hill']);
    expect(result.warnings).toEqual(['campaign.json: removed 2 null characters (U+0000) from its text, which the app cannot store.']);
  });

  it("imports a map's name and its tokens' names and notes without it", async () => {
    const result = await importCampaign(
      await archive({
        maps: [map({ name: 'Cel\u0000lar', tokens: [{ name: 'Gob\u0000lin', notes: '\u0000Sleeps', position: { x: 1, y: 1 }, size: { width: 1, height: 1 } }] })],
      }),
      userId
    );

    const [imported] = await prisma.map.findMany({ where: { campaignId: result.campaignId } });
    expect(imported.name).toBe('Cellar');
    expect(imported.tokens).toEqual([expect.objectContaining({ name: 'Goblin', notes: 'Sleeps' })]);
    expect(result.warnings).toEqual(['maps/map-0.json: removed 3 null characters (U+0000) from its text, which the app cannot store.']);
  });

  it("imports a creature's stat block without it, in a value or in a key", async () => {
    const result = await importCampaign(
      await archive({
        creatures: [{ name: 'Bandit', gameSystem: 'FIFTH_EDITION', statBlock: statBlock({ speed: '30\u0000 ft.', 'lair\u0000Notes': 'Cave' }) }],
      }),
      userId
    );

    const [creature] = await prisma.creatureTemplate.findMany({ where: { campaignId: result.campaignId } });
    expect(creature.statBlock).toMatchObject({ speed: '30 ft.', lairNotes: 'Cave' });
    expect(result.warnings).toEqual(['creatures/creatures.json: removed 2 null characters (U+0000) from its text, which the app cannot store.']);
  });

  it('checks a name left empty without it as one that was empty', async () => {
    const result = await importCampaign(
      await archive({ creatures: [{ name: '\u0000', gameSystem: 'FIFTH_EDITION', statBlock: statBlock() }], templates: [{ name: 'Guard\u0000', type: 'npc' }] }),
      userId
    );

    expect(result).toMatchObject({ creatureCount: 0, tokenTemplateCount: 1 });
    expect(result.skipped).toEqual([expect.objectContaining({ kind: 'creature', name: 'Unnamed creature' })]);
    const [template] = await prisma.tokenTemplate.findMany({ where: { campaignId: result.campaignId } });
    expect(template.name).toBe('Guard');
  });
});
