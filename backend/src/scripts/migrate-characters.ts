/**
 * Character Migration Script
 *
 * For characters stored before game systems existed: guesses a game system
 * from the shape of a sheet that has none. Not for a current instance, where a
 * character with no game system is a Flexible one on purpose.
 *
 * Usage:
 *   npm run migrate:characters                (preview, the default)
 *   npm run migrate:characters -- --execute   (apply)
 *
 * Only a high-confidence guess is ever applied, and only to a character that is
 * in no campaign or in a campaign of that same system: one in a Flexible
 * campaign is left alone, since a typed character cannot stay in it. Medium and
 * low guesses are listed and never applied. Every change is printed with the
 * character's id, so it can be reversed. Exits 1 if the run fails.
 */

// Loads backend/.env, which the database client does not read itself.
import 'dotenv/config';
import { PrismaClient, GameSystem, type Prisma } from '@prisma/client';
import { createPrismaClient } from '../config/prismaClient';
import { sheetAsSent } from '../legacy/sheetConversion';
import { oldHorrorD100Likeness } from '../legacy/horrorD100Sheet';
import { toJson } from '../utils/prisma-json';

interface MigrationReport {
  totalCharacters: number;
  charactersAnalyzed: number;
  systemsInferred: {
    [key in GameSystem]?: number;
  };
  alreadyAssigned: number;
  unableToInfer: number;
  changes: Array<{
    characterId: string;
    characterName: string;
    inferredSystem: GameSystem | null;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
    /** Whether the guess is applied (or would be, in a preview). */
    applied: boolean;
    /** Why a guess is not applied. */
    heldBack?: string;
  }>;
}

/**
 * Infer game system from character data structure
 */
/**
 * A JSON object probed only for the *presence* of nested keys.
 *
 * `inferGameSystem` sniffs the shape of a sheet written before game systems
 * were recorded, and never reads a leaf's value -- so it is the nesting that
 * needs describing, not the leaf types.
 */
interface ShapeProbe {
  [key: string]: ShapeProbe | undefined;
}

function inferGameSystem(rawData: unknown): {
  system: GameSystem | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
} {
  if (!rawData || typeof rawData !== 'object') {
    return { system: null, confidence: 'low', reason: 'Invalid or empty data' };
  }
  const data = rawData as ShapeProbe;

  // 5E Detection
  // Look for: stats.strength.score, stats.dexterity, proficiencyBonus
  if (data.stats?.strength?.score !== undefined &&
      data.stats?.dexterity?.score !== undefined &&
      data.proficiencyBonus !== undefined) {
    return {
      system: GameSystem.FIFTH_EDITION,
      confidence: 'high',
      reason: 'Has stats.strength.score, stats.dexterity, and proficiencyBonus (5E signature)'
    };
  }

  // Fantasy d20 Detection
  // Look for: attributes.strength.score + skills with proficiencyRank
  if (data.attributes?.strength?.score !== undefined &&
      data.attributes?.dexterity?.score !== undefined &&
      (data.skills?.acrobatics?.proficiencyRank !== undefined ||
       data.perception?.proficiencyRank !== undefined)) {
    return {
      system: GameSystem.FANTASY_D20,
      confidence: 'high',
      reason: 'Has attributes.strength.score and proficiencyRank fields (Fantasy d20 signature)'
    };
  }

  // Horror d100 Detection: the sheet before 1.7.0 kept each characteristic
  // as a value with its half and fifth, which no other sheet does. The old
  // sheet's keys are read by the legacy folder alone.
  const oldHorrorD100 = oldHorrorD100Likeness(rawData);
  if (oldHorrorD100 === 'signature') {
    return {
      system: GameSystem.HORROR_D100,
      confidence: 'high',
      reason: 'Has STR stored as a value with its half and fifth (the Horror d100 sheet before 1.7.0)'
    };
  }

  // Additional heuristics for lower confidence detection

  // Check for 5E class-specific fields
  if (data.class && data.level && data.race && data.stats) {
    return {
      system: GameSystem.FIFTH_EDITION,
      confidence: 'medium',
      reason: 'Has class, level, race, and stats (likely 5E)'
    };
  }

  // Check for Fantasy d20-specific fields
  if (data.ancestry && data.heritage && data.attributes) {
    return {
      system: GameSystem.FANTASY_D20,
      confidence: 'medium',
      reason: 'Has ancestry, heritage, and attributes (likely Fantasy d20)'
    };
  }

  // Check for Horror d100-specific fields: the rebuilt sheet's, then those of
  // the sheet before 1.7.0
  if (data.profession && data.era && data.characteristics) {
    return {
      system: GameSystem.HORROR_D100,
      confidence: 'medium',
      reason: 'Has profession, era, and characteristics (likely Horror d100)'
    };
  }
  if (oldHorrorD100 === 'likely') {
    return {
      system: GameSystem.HORROR_D100,
      confidence: 'medium',
      reason: 'Has a profession, an era and characteristics as the sheet before 1.7.0 named them (likely Horror d100)'
    };
  }

  // Unable to infer game system
  return {
    system: null,
    confidence: 'low',
    reason: 'Insufficient data to infer game system'
  };
}

/**
 * Why a guess must not be applied to this character, or null when it may be.
 */
function holdBack(
  confidence: 'high' | 'medium' | 'low',
  inferred: GameSystem,
  campaign: { gameSystem: GameSystem | null } | null
): string | null {
  if (confidence !== 'high') return `${confidence}-confidence guess, never applied`;
  if (campaign && campaign.gameSystem === null) return 'in a Flexible campaign, which a typed character cannot stay in';
  if (campaign && campaign.gameSystem !== inferred) return `in a ${campaign.gameSystem} campaign`;
  return null;
}

/**
 * Main migration function. Previews by default; writes only when `dryRun` is
 * false. `where` narrows the characters looked at.
 */
async function migrateCharacters(
  prisma: PrismaClient,
  options: { dryRun: boolean; where?: Prisma.CharacterWhereInput }
): Promise<MigrationReport> {
  const { dryRun } = options;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Character Migration Script`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'EXECUTE (changes will be applied)'}`);
  console.log(`${'='.repeat(60)}\n`);

  const report: MigrationReport = {
    totalCharacters: 0,
    charactersAnalyzed: 0,
    systemsInferred: {},
    alreadyAssigned: 0,
    unableToInfer: 0,
    changes: [],
  };

  const characters = await prisma.character.findMany({
    where: options.where,
    select: {
      id: true,
      name: true,
      gameSystem: true,
      data: true,
      campaign: { select: { gameSystem: true } },
    },
  });

  report.totalCharacters = characters.length;
  console.log(`Found ${characters.length} characters\n`);

  for (const character of characters) {
    report.charactersAnalyzed++;

    // Skip if already has a game system assigned
    if (character.gameSystem) {
      report.alreadyAssigned++;
      continue;
    }

    const inference = inferGameSystem(character.data);
    if (!inference.system) {
      report.unableToInfer++;
      continue;
    }

    report.systemsInferred[inference.system] = (report.systemsInferred[inference.system] ?? 0) + 1;
    const heldBack = holdBack(inference.confidence, inference.system, character.campaign);
    report.changes.push({
      characterId: character.id,
      characterName: character.name,
      inferredSystem: inference.system,
      confidence: inference.confidence,
      reason: inference.reason,
      applied: heldBack === null,
      ...(heldBack ? { heldBack } : {}),
    });

    if (!dryRun && heldBack === null) {
      // Only while it still has no game system, in case it was given one since.
      // A Horror d100 sheet, always in the shape before 1.7.0 here, is given
      // the rebuilt sheet in the same write, as every stored one has.
      const converted = sheetAsSent(inference.system, character.data);
      await prisma.character.updateMany({
        where: { id: character.id, gameSystem: null },
        data: converted !== character.data ? { gameSystem: inference.system, data: toJson(converted) } : { gameSystem: inference.system },
      });
    }
  }

  printReport(report, dryRun);
  return report;
}

/**
 * Print formatted migration report
 */
function printReport(report: MigrationReport, dryRun: boolean) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Migration Report');
  console.log(`${'='.repeat(60)}\n`);

  console.log('Summary:');
  console.log(`  Total characters: ${report.totalCharacters}`);
  console.log(`  Already assigned: ${report.alreadyAssigned}`);
  console.log(`  Unable to infer: ${report.unableToInfer}`);
  const appliedCount = report.changes.filter((c) => c.applied).length;
  console.log(`  Changes ${dryRun ? 'proposed' : 'applied'}: ${appliedCount}`);
  console.log(`  Guesses not applied: ${report.changes.length - appliedCount}\n`);

  if (Object.keys(report.systemsInferred).length > 0) {
    console.log('Systems inferred:');
    Object.entries(report.systemsInferred).forEach(([system, count]) => {
      console.log(`  ${system}: ${count}`);
    });
    console.log('');
  }

  if (report.changes.length > 0) {
    const applied = report.changes.filter((c) => c.applied);
    const held = report.changes.filter((c) => !c.applied);

    if (applied.length > 0) {
      console.log(`${dryRun ? 'Would be applied' : 'Applied'} (character id, name, system):\n`);
      applied.forEach((change) => {
        console.log(`  ${change.characterId}  "${change.characterName}" → ${change.inferredSystem}`);
        console.log(`      Reason: ${change.reason}`);
      });
      console.log('');
    }

    if (held.length > 0) {
      console.log('Not applied (character id, name, guess):\n');
      held.forEach((change) => {
        console.log(`  ${change.characterId}  "${change.characterName}" → ${change.inferredSystem}: ${change.heldBack}`);
      });
      console.log('');
    }
  }

  if (dryRun) {
    console.log(`${'='.repeat(60)}`);
    console.log('DRY RUN COMPLETE - No changes were made');
    console.log('Run with --execute to apply these changes');
    console.log(`${'='.repeat(60)}\n`);
  } else {
    console.log(`${'='.repeat(60)}`);
    console.log('MIGRATION COMPLETE');
    console.log(`${'='.repeat(60)}\n`);
  }
}

/**
 * CLI entry point
 */
async function main(prisma: PrismaClient) {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Character Migration Script

For characters stored before game systems existed. On a current instance a
character with no game system is a Flexible one on purpose, so preview first.

Usage:
  npm run migrate:characters              # Dry run (preview)
  npm run migrate:characters -- --dry-run # Dry run (preview)
  npm run migrate:characters -- --execute # Apply changes
  npm run migrate:characters -- --help    # Show help

Description:
  Guesses a game system from the structure of a sheet that has none.
  Only a high-confidence guess is applied, and never to a character in a
  Flexible campaign or in a campaign of another system. Every change is listed
  with the character's id.

Detection Heuristics:
  - 5E: stats.strength.score + proficiencyBonus
  - Fantasy d20: attributes.strength.score + proficiencyRank fields
  - Horror d100: STR stored as a value with its half and fifth (the sheet before 1.7.0)

Confidence Levels:
  HIGH:   Strong signature match, applied with --execute
  MEDIUM: Partial match, listed only
  LOW:    Weak match, listed only
    `);
    return;
  }

  await migrateCharacters(prisma, { dryRun });
}

// Run if called directly
if (require.main === module) {
  const prisma = createPrismaClient();
  main(prisma)
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

export { migrateCharacters, inferGameSystem };
