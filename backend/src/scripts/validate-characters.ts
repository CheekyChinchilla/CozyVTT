/**
 * Character Validation Script
 *
 * Checks every character against its game system's schema, the way the server
 * checks a sheet when it is saved, and lists the ones it would refuse. Older
 * fields are moved first, as the character routes do, so a sheet from before
 * 1.3.0 is judged as its next save would be. Nothing is written.
 *
 * Usage:
 *   npm run validate:characters                         (validate all)
 *   npm run validate:characters -- --system DND_5E      (one system; dnd5e works too)
 *   npm run validate:characters -- --verbose            (show every error)
 *   npm run validate:characters -- --export             (write validation-report.json)
 *
 * Exits 0 when every character passes, and 1 when one does not, when an
 * argument is not understood, or when the check could not run.
 */

import fs from 'fs';
import { PrismaClient, type Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { GameSystem } from '../game-systems';
import { validateCharacterData } from '../validators/game-systems';
import { migrateLegacySheetFields } from '../utils/sheetFieldMigrations';

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

interface ValidateOptions {
  gameSystem?: GameSystem;
  verbose: boolean;
  export: boolean;
  help: boolean;
}

/**
 * Format Zod error for readable output
 */
function formatZodError(error: ZodError): Array<{ path: string; message: string; code: string }> {
  return error.issues.map((err) => ({
    path: err.path.join('.') || 'root',
    message: err.message,
    code: err.code,
  }));
}

/**
 * A game system named on the command line: the name itself in any case, with
 * or without its underscores, so "DND_5E", "dnd_5e" and "dnd5e" all work.
 */
function readGameSystem(value: string): GameSystem | null {
  const squash = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return Object.values(GameSystem).find((system) => squash(system) === squash(value)) ?? null;
}

/** The command line, or what is wrong with it. */
export function parseValidateArgs(args: readonly string[]): ValidateOptions | { error: string } {
  const options: ValidateOptions = { verbose: false, export: false, help: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--verbose') options.verbose = true;
    else if (arg === '--export') options.export = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--system') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        return { error: '--system needs a game system after it, for example --system DND_5E' };
      }
      const system = readGameSystem(value);
      if (!system) {
        return { error: `Unknown game system "${value}". Use one of: ${Object.values(GameSystem).join(', ')}` };
      }
      options.gameSystem = system;
      i += 1;
    } else {
      return { error: `Unknown option "${arg}". Run with --help to see the options.` };
    }
  }
  return options;
}

/**
 * Validate the characters `where` selects, all of them by default, or those of
 * one game system.
 */
export async function validateCharacters(
  prisma: PrismaClient,
  options: { gameSystem?: GameSystem; verbose?: boolean; where?: Prisma.CharacterWhereInput }
): Promise<ValidationReport> {
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

  const where: Prisma.CharacterWhereInput = { ...options.where };
  if (options.gameSystem) {
    where.gameSystem = options.gameSystem;
  }

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

  for (const character of characters) {
    // Flexible characters have no schema to check against.
    if (!character.gameSystem) {
      report.noGameSystem++;
      continue;
    }

    const gameSystem = character.gameSystem as GameSystem; // Cast Prisma enum to game-systems enum
    const breakdown = (report.systemBreakdown[gameSystem] ??= { total: 0, valid: 0, invalid: 0 });
    breakdown.total++;

    // As the character routes do before validating a save.
    const sheet = migrateLegacySheetFields(gameSystem, character.data);
    const result = validateCharacterData(gameSystem, sheet);

    if (result.success) {
      report.validCharacters++;
      breakdown.valid++;
      if (options.verbose) console.log(`✓ "${character.name}" (${gameSystem}) ${character.id} - VALID`);
      continue;
    }

    report.invalidCharacters++;
    breakdown.invalid++;
    const formattedErrors = formatZodError(result.errors);
    report.issues.push({
      characterId: character.id,
      characterName: character.name,
      gameSystem,
      errors: formattedErrors,
    });

    console.log(`✗ "${character.name}" (${gameSystem}) ${character.id} - INVALID`);
    if (options.verbose) {
      formattedErrors.forEach((err) => console.log(`    ${err.path}: ${err.message}`));
    }
  }

  return report;
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
    console.log(`⚠ ${report.invalidCharacters} character(s) would be refused when next saved`);
    console.log('Open each one in the Character Editor and save it: the message names the field to correct.');
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
function exportValidationIssues(report: ValidationReport, outputPath: string) {
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

const HELP = `
Character Validation Script

Usage:
  npm run validate:characters                      # Validate all characters
  npm run validate:characters -- --verbose         # Show full error details
  npm run validate:characters -- --system DND_5E   # Validate one game system
  npm run validate:characters -- --export          # Export issues to JSON

Options:
  --system <system>   Only this game system: DND_5E, PATHFINDER_2E, SHADOWRUN_6E or
                      CALL_OF_CTHULHU_7E, in any case, with or without the underscores
  --verbose           Show detailed error messages for each character
  --export            Export validation issues to validation-report.json
  --help              Show this help message

Exits 0 when every character passes, and 1 when one does not or the check
could not run.

Examples:
  npm run validate:characters
  npm run validate:characters -- --system dnd5e --verbose
  npm run validate:characters -- --export --verbose
`;

/**
 * CLI entry point. Resolves to the exit code.
 */
async function main(prisma: PrismaClient): Promise<number> {
  const parsed = parseValidateArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(parsed.error);
    return 1;
  }
  if (parsed.help) {
    console.log(HELP);
    return 0;
  }

  const report = await validateCharacters(prisma, { gameSystem: parsed.gameSystem, verbose: parsed.verbose });
  printReport(report, parsed);
  if (parsed.export) exportValidationIssues(report, 'validation-report.json');
  return report.invalidCharacters > 0 ? 1 : 0;
}

// Run if called directly
if (require.main === module) {
  const prisma = new PrismaClient();
  main(prisma)
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error('Validation failed:', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

export type { ValidationReport, ValidationIssue };
