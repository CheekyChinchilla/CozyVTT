/**
 * Move every stored character sheet onto the fields the app reads.
 *
 * The built-in templates of versions before 1.3.0 seeded fields no reader knows
 * about, so sheets made from them carry real content in places nothing
 * displays. The transforms live in utils/sheetFieldMigrations, which the
 * character routes also apply to each sheet they are sent; this script applies
 * them to every sheet at once, so they read correctly without being saved
 * first. Pathfinder 2e strikes and class features need it, since the view does
 * not read the old fields.
 *
 *   npm run migrate:sheet-fields -- --dry-run    # report, change nothing
 *   npm run migrate:sheet-fields                 # apply
 *
 * Safe to run more than once: a sheet already on the new fields is skipped, and
 * a partial run simply continues where it left off. Nothing is deleted until
 * its content has been merged into the field that replaces it, and each
 * character is written in its own transaction, so an interruption cannot leave
 * one half-converted.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import {
  isSheet,
  migrateDnD5e,
  migratePathfinder2e,
  migrateCallOfCthulhu,
  type Sheet,
} from '../utils/sheetFieldMigrations';

const prisma = new PrismaClient();

interface Change {
  character: string;
  system: string;
  notes: string[];
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? 'DRY RUN — nothing will be written\n' : 'Applying changes\n');

  const characters = await prisma.character.findMany({
    select: { id: true, name: true, gameSystem: true, data: true },
    orderBy: { name: 'asc' },
  });

  const changed: Change[] = [];
  let skipped = 0;

  for (const character of characters) {
    if (!isSheet(character.data)) {
      skipped += 1;
      continue;
    }

    const notes: string[] = [];
    let next: Sheet = character.data as Sheet;

    switch (character.gameSystem) {
      case 'DND_5E':
        next = migrateDnD5e(next, notes);
        break;
      case 'PATHFINDER_2E':
        next = migratePathfinder2e(next, notes);
        break;
      case 'CALL_OF_CTHULHU_7E':
        next = migrateCallOfCthulhu(next, notes);
        break;
      default:
        // Flexible sheets have no fixed shape, and Shadowrun is not implemented.
        skipped += 1;
        continue;
    }

    if (JSON.stringify(next) === JSON.stringify(character.data)) {
      skipped += 1;
      continue;
    }

    changed.push({
      character: character.name,
      system: character.gameSystem ?? '(none)',
      notes: notes.length > 0 ? notes : ['normalised feature entries'],
    });

    if (!dryRun) {
      await prisma.$transaction([
        prisma.character.update({
          where: { id: character.id },
          data: { data: next as Prisma.InputJsonValue },
        }),
      ]);
    }
  }

  console.log(`${characters.length} character(s) examined`);
  console.log(`${changed.length} to change, ${skipped} already correct or not applicable\n`);
  for (const change of changed) {
    console.log(`  ${change.character}  [${change.system}]`);
    for (const note of change.notes) console.log(`      - ${note}`);
  }
  if (dryRun && changed.length > 0) {
    console.log('\nRe-run without --dry-run to apply.');
  }
}

// Only run when invoked directly.
if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
