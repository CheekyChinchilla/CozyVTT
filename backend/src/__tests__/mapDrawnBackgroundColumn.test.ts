/**
 * The colour a map drawn in CozyVTT was made in.
 *
 * It is optional, so a map from before the column, and one made from a
 * picture, has none. The migration that makes it only adds: an instance
 * upgrading onto years of maps loses and changes nothing.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import path from 'path';
import { prisma, createTestUser, createTestCampaign, cleanupUsers } from './helpers/db';

const MIGRATIONS = path.resolve(__dirname, '../../prisma/migrations');
const MIGRATION = fs.readdirSync(MIGRATIONS).find((name) => name.endsWith('_add_map_drawn_background'));

const userIds: string[] = [];

afterAll(async () => {
  await prisma.campaign.deleteMany({ where: { ownerId: { in: userIds } } });
  await cleanupUsers(userIds);
  await prisma.$disconnect();
});

describe("a map's drawn colour", () => {
  it('is null on a map made without one', async () => {
    const owner = await createTestUser({ displayName: 'Drawn colour GM' });
    userIds.push(owner.id);
    const campaign = await createTestCampaign(owner.id, { name: 'Drawn colour table' });
    const map = await prisma.map.create({
      data: { campaignId: campaign.id, name: 'Cave', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none', width: 10, height: 10, tokens: [], annotations: [] },
    });
    expect(map.drawnBackground).toBeNull();
  });
});

describe('the add_map_drawn_background migration', () => {
  const sql = MIGRATION ? fs.readFileSync(path.join(MIGRATIONS, MIGRATION, 'migration.sql'), 'utf8') : '';
  const statements = sql.replace(/--.*$/gm, '');

  it('exists, right after the migration before it', () => {
    expect(MIGRATION).toBeDefined();
    const names = fs.readdirSync(MIGRATIONS).filter((name) => /^\d{14}_/.test(name)).sort();
    expect(names[names.indexOf(MIGRATION!) - 1]).toBe('20261102224331_add_document_picture_links');
  });

  it('only adds: it drops, renames, retypes and deletes nothing', () => {
    expect(statements).not.toMatch(/\bDROP\b|\bRENAME\b|\bALTER\s+COLUMN\b.*\bTYPE\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b/i);
  });

  it('adds the column nullable, so an existing map needs no backfill', () => {
    expect(statements).toMatch(/ALTER TABLE "Map" ADD COLUMN\s+"drawnBackground" TEXT;/);
    expect(statements).not.toMatch(/NOT NULL|DEFAULT/i);
  });
});
