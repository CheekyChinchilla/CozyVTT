/**
 * A creature outlives the account that made it.
 *
 * CreatureTemplate.createdById had no foreign key, so deleting an account
 * left its creatures naming a user that no longer exists. The migration that
 * adds the key first clears those ids, since the key cannot be added while
 * any row breaks it, and the key then sets the column to null whenever its
 * user is deleted.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { prisma as appPrisma } from '../config/database';
import { prisma, createTestUser } from './helpers/db';

jest.setTimeout(60000);

const MIGRATIONS = path.resolve(__dirname, '../../prisma/migrations');
const ALL = fs.readdirSync(MIGRATIONS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const MIGRATION = ALL.find((name) => name.endsWith('_creature_template_author_set_null'));
const SCHEMA = 'creature_author_migration_test';

const base = process.env.DATABASE_URL;
let client: Client;

const sqlOf = (name: string) => fs.readFileSync(path.join(MIGRATIONS, name, 'migration.sql'), 'utf8');

/** Runs SQL with unqualified names inside the test's schema. */
async function inSchema(sql: string): Promise<void> {
  await client.query(`SET search_path TO "${SCHEMA}"`);
  try {
    await client.query(sql);
  } finally {
    await client.query('RESET search_path');
  }
}

async function addUser(id: string): Promise<void> {
  await client.query(
    `INSERT INTO "${SCHEMA}"."User" (id, email, "passwordHash", "displayName", "updatedAt") VALUES ($1, $2, 'x', 'Author', NOW())`,
    [id, `${id}@test.invalid`]
  );
}

async function addCreature(id: string, createdById: string | null): Promise<void> {
  await client.query(
    `INSERT INTO "${SCHEMA}"."CreatureTemplate" (id, name, "statBlock", "createdById", "updatedAt") VALUES ($1, $1, '{}', $2, NOW())`,
    [id, createdById]
  );
}

const authors = async (): Promise<Record<string, string | null>> => {
  const rows = await client.query<{ id: string; createdById: string | null }>(
    `SELECT id, "createdById" FROM "${SCHEMA}"."CreatureTemplate" ORDER BY id`
  );
  return Object.fromEntries(rows.rows.map((row) => [row.id, row.createdById]));
};

beforeAll(async () => {
  if (!base) throw new Error('This test needs DATABASE_URL');
  if (!MIGRATION) throw new Error('No migration adds the creature author key');
  client = new Client({ connectionString: base });
  await client.connect();
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.query(`CREATE SCHEMA "${SCHEMA}"`);
  // The database as the release before this migration left it.
  for (const name of ALL.slice(0, ALL.indexOf(MIGRATION))) await inSchema(sqlOf(name));
});

afterAll(async () => {
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.end();
  await prisma.$disconnect();
  await appPrisma.$disconnect();
});

describe('the migration', () => {
  it('clears an author id that names a deleted account, keeps one that names a real one, and keeps every creature', async () => {
    await addUser('author-kept');
    await addCreature('by-real-author', 'author-kept');
    await addCreature('by-deleted-author', 'author-gone');
    await addCreature('srd', null);

    await inSchema(sqlOf(MIGRATION ?? ''));

    expect(await authors()).toEqual({ 'by-deleted-author': null, 'by-real-author': 'author-kept', srd: null });
  });

  it('can run again and change nothing', async () => {
    const before = await authors();
    await inSchema(sqlOf(MIGRATION ?? ''));
    expect(await authors()).toEqual(before);
  });

  it('leaves a key that clears the author when the account is deleted', async () => {
    await client.query(`DELETE FROM "${SCHEMA}"."User" WHERE id = 'author-kept'`);
    expect((await authors())['by-real-author']).toBeNull();
  });
});

it('keeps a creature, with no author, when the account that made it is deleted', async () => {
  const user = await createTestUser();
  const creature = await prisma.creatureTemplate.create({
    data: { id: randomUUID(), name: 'Homebrew owlbear', statBlock: {}, createdById: user.id },
  });
  await prisma.user.delete({ where: { id: user.id } });
  try {
    expect(await prisma.creatureTemplate.findUnique({ where: { id: creature.id }, select: { createdById: true } })).toEqual({ createdById: null });
  } finally {
    await prisma.creatureTemplate.delete({ where: { id: creature.id } });
  }
});
