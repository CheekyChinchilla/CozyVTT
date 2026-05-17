/**
 * Character Validation Script
 * Validates all characters against their game system schemas
 *
 * Usage:
 *   npm run validate:characters              (validate all)
 *   npm run validate:characters -- --system dnd5e  (validate specific system)
 *   npm run validate:characters -- --verbose (show full error details)
 */

import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { GameSystem } from '../game-systems';
import { validateCharacterData } from '../validators/game-systems';

const prisma = new PrismaClient();

interface ValidationIssue {
  characterId: string;
  characterName: string;
  gameSystem: GameSystem | null;
  errors: Array<{
    path: string;
    message: string;
    code: string;
  }>;
}

interface ValidationReport {
  totalCharacters: number;
  validCharacters: number;
  invalidCharacters: number;
  noGameSystem: number;
  systemBreakdown: {
    [key in GameSystem]?: {
      total: number;
      valid: number;
      invalid: number;
    };
  };
  issues: ValidationIssue[];
}

/**
 * Format Zod error for readable output
 */
function formatZodError(error: ZodError): Array<{ path: string; message: string; code: string }> {
  return error.issues.map((err: any) => ({
    path: err.path.join('.') || 'root',
    message: err.message,
    code: err.code,
  }));
}

/**
 * Validate all characters or filter by game system
 */
async function validateCharacters(options: {
  gameSystem?: GameSystem;
  verbose?: boolean;
}): Promise<ValidationReport> {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Character Validation Script');
  if (options.gameSystem) {
    console.log(`Filtering: ${options.gameSystem}`);
  }
  console.log(`${'='.repeat(60)}\n`);

  const report: ValidationReport = {
    totalCharacters: 0,
    validCharacters: 0,
    invalidCharacters: 0,
    noGameSystem: 0,
    systemBreakdown: {},
    issues: [],
  };

  try {
    // Build query filter
    const where: any = {};
    if (options.gameSystem) {
      where.gameSystem = options.gameSystem;
    }

    // Fetch characters
    const characters = await prisma.character.findMany({
      where,
      select: {
        id: true,
        name: true,
        gameSystem: true,
        data: true,
      },
    });

    report.totalCharacters = characters.length;
    console.log(`Found ${characters.length} characters\n`);

    // Validate each character
    for (const character of characters) {
      // Skip if no game system
      if (!character.gameSystem) {
        report.noGameSystem++;
        continue;
      }

      const gameSystem = character.gameSystem as GameSystem; // Cast Prisma enum to game-systems enum

      // Initialize system breakdown
      if (!report.systemBreakdown[gameSystem]) {
        report.systemBreakdown[gameSystem] = {
          total: 0,
          valid: 0,
          invalid: 0,
        };
      }
      report.systemBreakdown[gameSystem]!.total++;

      try {
        // Validate character data
        validateCharacterData(gameSystem, character.data);

        // Valid character
        report.validCharacters++;
        report.systemBreakdown[gameSystem]!.valid++;

        if (options.verbose) {
          console.log(`✓ "${character.name}" (${gameSystem}) - VALID`);
        }
      } catch (error) {
        // Invalid character
        report.invalidCharacters++;
        report.systemBreakdown[gameSystem]!.invalid++;

        if (error instanceof ZodError) {
          const formattedErrors = formatZodError(error);

          report.issues.push({
            characterId: character.id,
            characterName: character.name,
            gameSystem: gameSystem,
            errors: formattedErrors,
          });

          console.log(`✗ "${character.name}" (${gameSystem}) - INVALID`);
          if (options.verbose) {
            formattedErrors.forEach(err => {
              console.log(`    ${err.path}: ${err.message}`);
            });
          }
        } else {
          console.error(`✗ "${character.name}" (${gameSystem}) - ERROR:`, error);
        }
      }
    }

    // Print report
    printReport(report, options);

    return report;
  } catch (error) {
    console.error('Validation failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Print formatted validation report
 */
function printReport(report: ValidationReport, options: { verbose?: boolean }) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Validation Report');
  console.log(`${'='.repeat(60)}\n`);

  console.log('Summary:');
  console.log(`  Total characters: ${report.totalCharacters}`);
  console.log(`  Valid: ${report.validCharacters} (${getPercentage(report.validCharacters, report.totalCharacters)}%)`);
  console.log(`  Invalid: ${report.invalidCharacters} (${getPercentage(report.invalidCharacters, report.totalCharacters)}%)`);
  console.log(`  No game system: ${report.noGameSystem}\n`);

  if (Object.keys(report.systemBreakdown).length > 0) {
    console.log('Breakdown by Game System:');
    Object.entries(report.systemBreakdown).forEach(([system, stats]) => {
      const validPercent = getPercentage(stats.valid, stats.total);
      console.log(`  ${system}:`);
      console.log(`    Total: ${stats.total}`);
      console.log(`    Valid: ${stats.valid} (${validPercent}%)`);
      console.log(`    Invalid: ${stats.invalid} (${100 - validPercent}%)`);
    });
    console.log('');
  }

  if (report.issues.length > 0 && !options.verbose) {
    console.log('Common Validation Issues:\n');

    // Group errors by path
    const errorsByPath: { [path: string]: number } = {};
    report.issues.forEach(issue => {
      issue.errors.forEach(err => {
        errorsByPath[err.path] = (errorsByPath[err.path] || 0) + 1;
      });
    });

    // Sort by frequency
    const sortedErrors = Object.entries(errorsByPath)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    sortedErrors.forEach(([path, count]) => {
      console.log(`  ${path}: ${count} occurrence(s)`);
    });

    console.log('');
    console.log(`Run with --verbose to see full error details\n`);
  }

  if (report.invalidCharacters > 0) {
    console.log(`${'='.repeat(60)}`);
    console.log(`⚠ ${report.invalidCharacters} character(s) have validation issues`);
    console.log('Players can use the Data Fixer Tool to resolve these issues');
    console.log(`${'='.repeat(60)}\n`);
  } else {
    console.log(`${'='.repeat(60)}`);
    console.log('✓ All characters passed validation!');
    console.log(`${'='.repeat(60)}\n`);
  }
}

/**
 * Calculate percentage
 */
function getPercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

/**
 * Export validation issues to JSON
 */
async function exportValidationIssues(report: ValidationReport, outputPath: string) {
  const fs = require('fs');

  const exportData = {
    generatedAt: new Date().toISOString(),
    summary: {
      total: report.totalCharacters,
      valid: report.validCharacters,
      invalid: report.invalidCharacters,
      noGameSystem: report.noGameSystem,
    },
    issues: report.issues,
  };

  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`\n✓ Validation issues exported to: ${outputPath}\n`);
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Character Validation Script

Usage:
  npm run validate:characters                     # Validate all characters
  npm run validate:characters -- --verbose        # Show full error details
  npm run validate:characters -- --system dnd5e   # Validate specific system
  npm run validate:characters -- --export         # Export issues to JSON

Options:
  --system <system>   Filter by game system (DND_5E, PATHFINDER_2E, SHADOWRUN_6E, CALL_OF_CTHULHU_7E)
  --verbose           Show detailed error messages for each character
  --export            Export validation issues to validation-report.json
  --help              Show this help message

Game Systems:
  DND_5E              Dungeons & Dragons 5th Edition
  PATHFINDER_2E       Pathfinder 2nd Edition
  SHADOWRUN_6E        Shadowrun 6th Edition
  CALL_OF_CTHULHU_7E  Call of Cthulhu 7th Edition

Examples:
  npm run validate:characters
  npm run validate:characters -- --verbose
  npm run validate:characters -- --system DND_5E
  npm run validate:characters -- --export --verbose
    `);
    process.exit(0);
  }

  const options = {
    gameSystem: args.find(arg => arg !== '--verbose' && arg !== '--export' && !arg.startsWith('--system'))
      ? args[args.indexOf('--system') + 1] as GameSystem
      : undefined,
    verbose: args.includes('--verbose'),
  };

  const report = await validateCharacters(options);

  if (args.includes('--export')) {
    await exportValidationIssues(report, 'validation-report.json');
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { validateCharacters, ValidationReport, ValidationIssue };
