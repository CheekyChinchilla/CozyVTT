/**
 * backfillCreatureProficiency.ts
 * CLI script to record proficiency structure on seeded SRD creatures.
 *
 * Run with:
 *   npx ts-node src/scripts/backfillCreatureProficiency.ts --dry-run
 *   npx ts-node src/scripts/backfillCreatureProficiency.ts
 *
 * Safe to run more than once: creatures that already carry proficiency data are
 * skipped. No printed bonus is ever changed, and only creatures with
 * source = 'srd' are touched — custom creatures are never read or written.
 */

// Loads backend/.env, which the database client does not read itself.
import 'dotenv/config';
import { prisma } from '../config/database';
import { backfillCreatureProficiency } from '../services/creatureProficiencyBackfill';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const verbose = process.argv.includes('--verbose');

  console.log('CozyVTT Creature Proficiency Backfill');
  console.log(
    dryRun
      ? 'DRY RUN — reporting what would change, writing nothing.\n'
      : 'Recording proficiency structure on seeded SRD creatures.\n'
  );

  const result = await backfillCreatureProficiency({ dryRun });

  console.log(`SRD creatures scanned:      ${result.scanned}`);
  console.log(`Updated:                    ${result.changed}`);
  console.log(`Already had structure:      ${result.skippedAlreadyDone}`);
  console.log(`Entries kept as custom:     ${result.customEntries}`);

  const renamed = result.changes.reduce((n, c) => n + c.renamedSkills.length, 0);
  console.log(`Skill keys normalised:      ${renamed}`);

  if (verbose) {
    console.log('\nPer-creature detail:');
    for (const change of result.changes) {
      const saves = Object.entries(change.saves)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
      const skills = Object.entries(change.skills)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
      console.log(`  ${change.name}: ${[saves, skills].filter(Boolean).join(' | ')}`);
      for (const rename of change.renamedSkills) {
        console.log(`      renamed ${rename.from} -> ${rename.to}`);
      }
    }
  }

  console.log(
    dryRun
      ? '\nDry run complete. No values were changed and nothing was written.'
      : '\nDone. No printed bonus was changed — only the structure behind it was recorded.'
  );
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
