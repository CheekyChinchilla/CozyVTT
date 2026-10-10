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
 *   node dist/scripts/migrate-sheet-fields.js --dry-run    # report, change nothing
 *   node dist/scripts/migrate-sheet-fields.js              # apply
 *
 * Safe to run more than once, and safe to run while people are playing. Each
 * character is locked, read again and migrated from that fresh copy inside its
 * own transaction, so a save or a hit point change made since the first read
 * is kept, and an interruption cannot leave one half-converted. An older field
 * is removed only once everything in it is in the field that replaces it; one
 * holding something with nowhere to go is left and listed. Exits non-zero if
 * the run fails or a character could not be written.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import {
  isSheet,
  migrateDnD5e,
  migratePathfinder2e,
  migrateCallOfCthulhu,
  type Sheet,
} from '../utils/sheetFieldMigrations';

interface Change {
  id: string;
  character: string;
  system: string;
  notes: string[];
}

export interface SheetFieldReport {
  examined: number;
  /** Sheets changed, or that would be in a dry run. */
  changed: Change[];
  /** Sheets left as they are, with something kept in an older field. */
  kept: Change[];
  /** Sheets already correct, or of a system with no older shape. */
  unchanged: number;
  /** Sheets that changed while being written, left for the next run. */
  busy: Change[];
}

/** The transform for a sheet's system, or null for one with no older shape. */
function migrateSheet(gameSystem: string | null, data: unknown): { next: Sheet; notes: string[] } | null {
  if (!isSheet(data)) return null;
  const notes: string[] = [];
  switch (gameSystem) {
    case 'DND_5E':
      return { next: migrateDnD5e(data, notes), notes };
    case 'PATHFINDER_2E':
      return { next: migratePathfinder2e(data, notes), notes };
    case 'CALL_OF_CTHULHU_7E':
      return { next: migrateCallOfCthulhu(data, notes), notes };
    default:
      // Flexible sheets have no fixed shape, and Shadowrun is not implemented.
      return null;
  }
}

/**
 * Move the characters `where` selects, all of them by default, onto the
 * fields the app reads. Nothing is written in a dry run.
 */
export async function migrateSheetFields(
  prisma: PrismaClient,
  options: { dryRun: boolean; where?: Prisma.CharacterWhereInput }
): Promise<SheetFieldReport> {
  const characters = await prisma.character.findMany({
    where: options.where,
    select: { id: true, name: true, gameSystem: true, data: true },
    orderBy: { name: 'asc' },
  });

  const report: SheetFieldReport = { examined: characters.length, changed: [], kept: [], unchanged: 0, busy: [] };

  for (const character of characters) {
    const migrated = migrateSheet(character.gameSystem, character.data);
    const entry = (notes: string[]): Change => ({
      id: character.id,
      character: character.name,
      system: character.gameSystem ?? '(none)',
      notes,
    });

    if (!migrated || JSON.stringify(migrated.next) === JSON.stringify(character.data)) {
      if (migrated && migrated.notes.length > 0) report.kept.push(entry(migrated.notes));
      else report.unchanged += 1;
      continue;
    }

    const described = (notes: string[]) => (notes.length > 0 ? notes : ['normalised feature entries']);

    if (options.dryRun) {
      report.changed.push(entry(described(migrated.notes)));
      continue;
    }

    // The sheet may have been saved since it was read above. Lock its row, so a
    // save or a hit point change arriving now waits, read it again and migrate
    // that copy. The write is also guarded by the time of that read.
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${character.id} FOR UPDATE`;
      const fresh = await tx.character.findUnique({
        where: { id: character.id },
        select: { gameSystem: true, data: true, updatedAt: true },
      });
      if (!fresh) return { kind: 'gone' } as const;
      const current = migrateSheet(fresh.gameSystem, fresh.data);
      if (!current || JSON.stringify(current.next) === JSON.stringify(fresh.data)) {
        return { kind: 'unchanged', notes: current?.notes ?? [] } as const;
      }
      const written = await tx.character.updateMany({
        where: { id: character.id, updatedAt: fresh.updatedAt },
        data: { data: current.next as Prisma.InputJsonValue },
      });
      return written.count === 1
        ? ({ kind: 'written', notes: current.notes } as const)
        : ({ kind: 'busy', notes: current.notes } as const);
    });

    switch (outcome.kind) {
      case 'written':
        report.changed.push(entry(described(outcome.notes)));
        break;
      case 'busy':
        report.busy.push(entry(described(outcome.notes)));
        break;
      case 'unchanged':
        // Saved meanwhile, and the save moved the fields already.
        if (outcome.notes.length > 0) report.kept.push(entry(outcome.notes));
        else report.unchanged += 1;
        break;
      case 'gone':
        break;
    }
  }

  return report;
}

function printReport(report: SheetFieldReport, dryRun: boolean): void {
  console.log(`${report.examined} character(s) examined`);
  console.log(`${report.changed.length} to change, ${report.unchanged} already correct or not applicable\n`);
  for (const change of report.changed) {
    console.log(`  ${change.character}  [${change.system}]  ${change.id}`);
    for (const note of change.notes) console.log(`      - ${note}`);
  }
  if (report.kept.length > 0) {
    console.log(`\n${report.kept.length} character(s) keep something in an older field, with nowhere to move it:`);
    for (const kept of report.kept) {
      console.log(`  ${kept.character}  [${kept.system}]  ${kept.id}`);
      for (const note of kept.notes) console.log(`      - ${note}`);
    }
  }
  if (report.busy.length > 0) {
    console.log(`\n${report.busy.length} character(s) changed while being written and were left as they are. Run this again:`);
    for (const busy of report.busy) console.log(`  ${busy.character}  [${busy.system}]  ${busy.id}`);
  }
  if (dryRun && report.changed.length > 0) {
    console.log('\nRe-run without --dry-run to apply.');
  }
}

// Only run when invoked directly.
if (require.main === module) {
  const prisma = new PrismaClient();
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? 'DRY RUN — nothing will be written\n' : 'Applying changes\n');
  migrateSheetFields(prisma, { dryRun })
    .then((report) => {
      printReport(report, dryRun);
      if (report.busy.length > 0) process.exitCode = 1;
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
