/**
 * The character and the purpose a saved roll keeps.
 *
 * Both are optional, so a saved roll from before the columns, and one saved
 * without them, has neither. The migration that makes them only adds: an
 * instance upgrading onto its players' saved rolls loses and changes nothing.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import path from 'path';
import { prisma, createTestUser, createTestCampaign, cleanupUsers } from './helpers/db';

const MIGRATIONS = path.resolve(__dirname, '../../prisma/migrations');
const MIGRATION = fs.readdirSync(MIGRATIONS).find((name) => name.endsWith('_add_dice_macro_character'));

const userIds: string[] = [];

afterAll(async () => {
  await prisma.campaign.deleteMany({ where: { ownerId: { in: userIds } } });
  await cleanupUsers(userIds);
  await prisma.$disconnect();
});

async function campaignOfMyOwn() {
  const owner = await createTestUser({ displayName: 'Saved roll DM' });
  userIds.push(owner.id);
  const campaign = await createTestCampaign(owner.id, { name: 'Saved roll table' });
  return { owner, campaign };
}

describe('a saved roll\'s character and purpose', () => {
  it('are null on a saved roll made without them', async () => {
    const { owner, campaign } = await campaignOfMyOwn();
    const macro = await prisma.diceMacro.create({
      data: { userId: owner.id, campaignId: campaign.id, name: 'Longsword', expression: '1d20+5' },
    });
    expect(macro).toMatchObject({ characterName: null, purpose: null });
  });

  it('are kept as given', async () => {
    const { owner, campaign } = await campaignOfMyOwn();
    const macro = await prisma.diceMacro.create({
      data: {
        userId: owner.id, campaignId: campaign.id, name: 'Goblin', expression: '1d20+4',
        characterName: 'Goblin boss', purpose: 'Scimitar attack',
      },
    });
    expect(await prisma.diceMacro.findUniqueOrThrow({ where: { id: macro.id } })).toMatchObject({
      characterName: 'Goblin boss', purpose: 'Scimitar attack',
    });
  });
});

describe('the add_dice_macro_character migration', () => {
  const sql = MIGRATION ? fs.readFileSync(path.join(MIGRATIONS, MIGRATION, 'migration.sql'), 'utf8') : '';

  it('exists', () => {
    expect(MIGRATION).toBeDefined();
  });

  it('only adds: it drops, renames, retypes and deletes nothing', () => {
    const statements = sql.replace(/--.*$/gm, '');
    expect(statements).not.toMatch(/\bDROP\b|\bRENAME\b|\bALTER\s+COLUMN\b.*\bTYPE\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b/i);
  });

  it('adds the two columns nullable, so an existing saved roll needs no backfill', () => {
    const statements = sql.replace(/--.*$/gm, '');
    expect(statements).toMatch(/ADD COLUMN\s+"characterName" TEXT,/);
    expect(statements).toMatch(/ADD COLUMN\s+"purpose" TEXT;/);
    expect(statements).not.toMatch(/NOT NULL|DEFAULT/i);
  });
});
