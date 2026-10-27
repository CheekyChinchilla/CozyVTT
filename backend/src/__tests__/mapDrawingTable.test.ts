/**
 * The table drawings on a map are kept in, and the campaign setting that
 * lets players draw.
 *
 * A drawing is one row, with its map and its author. It goes with its map,
 * and so with its campaign; it stays when its author's account is deleted,
 * with no author. Every campaign, those that existed before the column
 * included, lets players draw until its DM says otherwise. The migration
 * that makes them only adds: an instance upgrading onto years of campaigns
 * loses and changes nothing.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import path from 'path';
import { prisma, createTestUser, createTestCampaign, cleanupUsers } from './helpers/db';

const MIGRATIONS = path.resolve(__dirname, '../../prisma/migrations');
const MIGRATION = fs.readdirSync(MIGRATIONS).find((name) => name.endsWith('_add_map_drawings'));

const userIds: string[] = [];

afterAll(async () => {
  await prisma.campaign.deleteMany({ where: { ownerId: { in: userIds } } });
  await cleanupUsers(userIds);
  await prisma.$disconnect();
});

async function campaignWithMap() {
  const owner = await createTestUser({ displayName: 'Drawing DM' });
  userIds.push(owner.id);
  const campaign = await createTestCampaign(owner.id, { name: 'Drawing table' });
  const map = await prisma.map.create({
    data: {
      campaignId: campaign.id, name: 'Drawn on', imageUrl: '', baseLayerUrl: '',
      width: 10, height: 10, tokens: [], annotations: [],
    },
  });
  return { owner, campaign, map };
}

const line = (mapId: string, authorId: string | null) =>
  prisma.mapDrawing.create({
    data: { mapId, authorId, kind: 'line', color: '#d94f3d', width: 4, points: [[0, 0], [100, 50]] },
  });

describe('the MapDrawing table', () => {
  it('keeps a drawing with the defaults the approved schema gives it', async () => {
    const { owner, map } = await campaignWithMap();
    const drawing = await line(map.id, owner.id);
    expect(drawing).toMatchObject({
      audience: 'ALL', layer: 'MARKUP', fillColor: null, pattern: null, stamp: null,
      rotation: 0, sortKey: 0, text: null, points: [[0, 0], [100, 50]],
    });
    expect(drawing.createdAt).toBeInstanceOf(Date);
  });

  it('takes a drawing for the DM alone and on the ground layer, which the database allows', async () => {
    const { owner, map } = await campaignWithMap();
    const drawing = await prisma.mapDrawing.create({
      data: { mapId: map.id, authorId: owner.id, kind: 'rect', color: '#1a1a1a', width: 2, points: [[0, 0], [5, 5]], audience: 'DM', layer: 'GROUND' },
    });
    expect(drawing).toMatchObject({ audience: 'DM', layer: 'GROUND' });
  });

  it('loses a map\'s drawings with the map', async () => {
    const { owner, map } = await campaignWithMap();
    const drawing = await line(map.id, owner.id);
    await prisma.map.delete({ where: { id: map.id } });
    expect(await prisma.mapDrawing.findUnique({ where: { id: drawing.id } })).toBeNull();
  });

  it('loses a campaign\'s drawings with the campaign', async () => {
    const { owner, campaign, map } = await campaignWithMap();
    const drawing = await line(map.id, owner.id);
    await prisma.campaign.delete({ where: { id: campaign.id } });
    expect(await prisma.mapDrawing.findUnique({ where: { id: drawing.id } })).toBeNull();
  });

  it('keeps a drawing whose author\'s account is deleted, with no author', async () => {
    const { map } = await campaignWithMap();
    const author = await createTestUser({ displayName: 'Drawing player' });
    userIds.push(author.id);
    const drawing = await line(map.id, author.id);
    await prisma.user.delete({ where: { id: author.id } });
    expect((await prisma.mapDrawing.findUniqueOrThrow({ where: { id: drawing.id } })).authorId).toBeNull();
  });
});

describe('Players may draw', () => {
  it('is on for a campaign made without it', async () => {
    const { campaign } = await campaignWithMap();
    expect(campaign.playersMayDraw).toBe(true);
  });
});

describe('the add_map_drawings migration', () => {
  const sql = MIGRATION ? fs.readFileSync(path.join(MIGRATIONS, MIGRATION, 'migration.sql'), 'utf8') : '';

  it('exists', () => {
    expect(MIGRATION).toBeDefined();
  });

  it('only adds: it drops, renames, retypes and deletes nothing', () => {
    const statements = sql.replace(/--.*$/gm, '').replace(/ON (DELETE|UPDATE) (CASCADE|SET NULL)/g, '');
    expect(statements).not.toMatch(/\bDROP\b|\bRENAME\b|\bALTER\s+COLUMN\b.*\bTYPE\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b/i);
  });

  it('gives the new campaign column a default, so existing campaigns need no backfill', () => {
    expect(sql).toMatch(/ALTER TABLE "Campaign" ADD COLUMN\s+"playersMayDraw" BOOLEAN NOT NULL DEFAULT true/);
  });
});
