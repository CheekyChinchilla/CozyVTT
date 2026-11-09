/**
 * The table of what each document names, and the column saying it was read.
 *
 * Both start empty on an upgraded instance: no document has been read for
 * them yet, so each existing one is read later, by the requests. The
 * migration that makes them only adds: an instance upgrading onto years of
 * documents and pictures loses and changes nothing.
 */

import fs from 'fs';
import path from 'path';

const MIGRATIONS = path.resolve(__dirname, '../../prisma/migrations');
const MIGRATION = fs.readdirSync(MIGRATIONS).find((name) => name.endsWith('_add_document_picture_links'));

describe('the add_document_picture_links migration', () => {
  const sql = MIGRATION ? fs.readFileSync(path.join(MIGRATIONS, MIGRATION, 'migration.sql'), 'utf8') : '';
  const statements = sql.replace(/--.*$/gm, '');

  // Later migrations may follow it; none may come between it and the one it was written after.
  it('exists, right after the migration before it', () => {
    expect(MIGRATION).toBeDefined();
    const names = fs.readdirSync(MIGRATIONS).filter((name) => /^\d{14}_/.test(name)).sort();
    expect(names[names.indexOf(MIGRATION!) - 1]).toBe('20261101181352_add_dice_macro_character');
  });

  it('only adds: it drops, renames, retypes, updates and deletes nothing', () => {
    expect(statements).not.toMatch(/\bDROP\b|\bRENAME\b|\bALTER\s+COLUMN\b.*\bTYPE\b|\bDELETE\s+FROM\b|\bTRUNCATE\b|\bUPDATE\s+"/i);
  });

  it('adds the column nullable with no default, so no existing asset is rewritten or marked read', () => {
    expect(statements).toMatch(/ALTER TABLE "Asset" ADD COLUMN\s+"picturesReadAt" TIMESTAMP\(3\);/);
  });

  it('makes each row go with its document and with the asset it names', () => {
    expect(statements).toMatch(/FOREIGN KEY \("documentId"\) REFERENCES "Asset"\("id"\) ON DELETE CASCADE/);
    expect(statements).toMatch(/FOREIGN KEY \("pictureId"\) REFERENCES "Asset"\("id"\) ON DELETE CASCADE/);
  });

  it('finds a row by its document and by the asset it names', () => {
    expect(statements).toMatch(/PRIMARY KEY \("documentId","pictureId"\)/);
    expect(statements).toMatch(/CREATE INDEX "DocumentPicture_pictureId_idx" ON "DocumentPicture"\("pictureId"\);/);
  });
});
