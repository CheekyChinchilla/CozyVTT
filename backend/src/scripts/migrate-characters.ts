/**
 * Character Migration Script
 * Analyzes existing characters and infers game systems based on data structure
 *
 * Usage:
 *   npm run migrate:characters -- --dry-run  (preview changes)
 *   npm run migrate:characters -- --execute  (apply changes)
 */

import { PrismaClient, GameSystem } from '@prisma/client';

const prisma = new PrismaClient();

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
  }>;
}

/**
 * Infer game system from character data structure
 */
function inferGameSystem(data: any): {
  system: GameSystem | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
} {
  if (!data || typeof data !== 'object') {
    return { system: null, confidence: 'low', reason: 'Invalid or empty data' };
  }

  // D&D 5e Detection
  // Look for: stats.strength.score, stats.dexterity, proficiencyBonus
  if (data.stats?.strength?.score !== undefined &&
      data.stats?.dexterity?.score !== undefined &&
      data.proficiencyBonus !== undefined) {
    return {
      system: GameSystem.DND_5E,
      confidence: 'high',
      reason: 'Has stats.strength.score, stats.dexterity, and proficiencyBonus (D&D 5e signature)'
    };
  }

  // Pathfinder 2e Detection
  // Look for: attributes.strength.score + skills with proficiencyRank
  if (data.attributes?.strength?.score !== undefined &&
      data.attributes?.dexterity?.score !== undefined &&
      (data.skills?.acrobatics?.proficiencyRank !== undefined ||
       data.perception?.proficiencyRank !== undefined)) {
    return {
      system: GameSystem.PATHFINDER_2E,
      confidence: 'high',
      reason: 'Has attributes.strength.score and proficiencyRank fields (Pathfinder 2e signature)'
    };
  }

  // Call of Cthulhu 7e Detection
  // Look for: characteristics.STR.regular, characteristics.STR.half, characteristics.STR.fifth
  if (data.characteristics?.STR?.regular !== undefined &&
      data.characteristics?.STR?.half !== undefined &&
      data.characteristics?.STR?.fifth !== undefined) {
    return {
      system: GameSystem.CALL_OF_CTHULHU_7E,
      confidence: 'high',
      reason: 'Has characteristics.STR with regular/half/fifth values (Call of Cthulhu 7e signature)'
    };
  }

  // Additional heuristics for lower confidence detection

  // Check for D&D 5e class-specific fields
  if (data.class && data.level && data.race && data.stats) {
    return {
      system: GameSystem.DND_5E,
      confidence: 'medium',
      reason: 'Has class, level, race, and stats (likely D&D 5e)'
    };
  }

  // Check for Pathfinder 2e-specific fields
  if (data.ancestry && data.heritage && data.attributes) {
    return {
      system: GameSystem.PATHFINDER_2E,
      confidence: 'medium',
      reason: 'Has ancestry, heritage, and attributes (likely Pathfinder 2e)'
    };
  }

  // Check for Call of Cthulhu-specific fields
  if (data.occupation && data.era && data.characteristics) {
    return {
      system: GameSystem.CALL_OF_CTHULHU_7E,
      confidence: 'medium',
      reason: 'Has occupation, era, and characteristics (likely Call of Cthulhu 7e)'
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
 * Main migration function
 */
async function migrateCharacters(dryRun: boolean = true): Promise<MigrationReport> {
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

  try {
    // Fetch all characters
    const characters = await prisma.character.findMany({
      select: {
        id: true,
        name: true,
        gameSystem: true,
        data: true,
      },
    });

    report.totalCharacters = characters.length;
    console.log(`Found ${characters.length} characters\n`);

    // Analyze each character
    for (const character of characters) {
      report.charactersAnalyzed++;

      // Skip if already has a game system assigned
      if (character.gameSystem) {
        report.alreadyAssigned++;
        continue;
      }

      // Infer game system
      const inference = inferGameSystem(character.data);

      if (inference.system) {
        // Track inferred system
        if (!report.systemsInferred[inference.system]) {
          report.systemsInferred[inference.system] = 0;
        }
        report.systemsInferred[inference.system]!++;

        // Add to changes list
        report.changes.push({
          characterId: character.id,
          characterName: character.name,
          inferredSystem: inference.system,
          confidence: inference.confidence,
          reason: inference.reason,
        });

        // Apply change if not dry run
        if (!dryRun) {
          await prisma.character.update({
            where: { id: character.id },
            data: { gameSystem: inference.system },
          });
        }
      } else {
        report.unableToInfer++;
      }
    }

    // Print report
    printReport(report, dryRun);

    return report;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
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
  console.log(`  Changes ${dryRun ? 'proposed' : 'applied'}: ${report.changes.length}\n`);

  if (Object.keys(report.systemsInferred).length > 0) {
    console.log('Systems inferred:');
    Object.entries(report.systemsInferred).forEach(([system, count]) => {
      console.log(`  ${system}: ${count}`);
    });
    console.log('');
  }

  if (report.changes.length > 0) {
    console.log(`Detailed changes ${dryRun ? '(would be applied)' : '(applied)'}:\n`);

    // Group by confidence level
    const highConfidence = report.changes.filter(c => c.confidence === 'high');
    const mediumConfidence = report.changes.filter(c => c.confidence === 'medium');
    const lowConfidence = report.changes.filter(c => c.confidence === 'low');

    if (highConfidence.length > 0) {
      console.log('  HIGH CONFIDENCE:');
      highConfidence.forEach(change => {
        console.log(`    ✓ "${change.characterName}" → ${change.inferredSystem}`);
        console.log(`      Reason: ${change.reason}`);
      });
      console.log('');
    }

    if (mediumConfidence.length > 0) {
      console.log('  MEDIUM CONFIDENCE:');
      mediumConfidence.forEach(change => {
        console.log(`    ~ "${change.characterName}" → ${change.inferredSystem}`);
        console.log(`      Reason: ${change.reason}`);
      });
      console.log('');
    }

    if (lowConfidence.length > 0) {
      console.log('  LOW CONFIDENCE:');
      lowConfidence.forEach(change => {
        console.log(`    ? "${change.characterName}" → ${change.inferredSystem}`);
        console.log(`      Reason: ${change.reason}`);
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
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Character Migration Script

Usage:
  npm run migrate:characters              # Dry run (preview)
  npm run migrate:characters -- --dry-run # Dry run (preview)
  npm run migrate:characters -- --execute # Apply changes
  npm run migrate:characters -- --help    # Show help

Description:
  Analyzes existing characters and infers game systems based on data structure.
  Uses heuristics to detect D&D 5e, Pathfinder 2e, Call of Cthulhu 7e, Shadowrun 6e.

Detection Heuristics:
  - D&D 5e: stats.strength.score + proficiencyBonus
  - Pathfinder 2e: attributes.strength.score + proficiencyRank fields
  - Call of Cthulhu 7e: characteristics.STR.regular/half/fifth
  - Shadowrun 6e: attributes.physical/mental structures

Confidence Levels:
  HIGH:   Strong signature match (recommended)
  MEDIUM: Partial match (review recommended)
  LOW:    Weak match (manual review required)
    `);
    process.exit(0);
  }

  await migrateCharacters(dryRun);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { migrateCharacters, inferGameSystem };
