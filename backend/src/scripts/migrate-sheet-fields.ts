/**
 * Move character sheets onto the fields the app actually reads.
 *
 * The built-in templates were written against an older shape and never caught
 * up, so they seeded fields no reader knows about. The save route stores the
 * request body as sent rather than Zod's parsed output, so those fields were
 * kept and then ignored by everything. Sheets made from a template therefore
 * carry real content in places nothing displays.
 *
 * Reading is already fixed for D&D 5e — the sheet folds the old field in when
 * it loads, so features show up with no migration at all. This script is for
 * the rest: Pathfinder strikes and class features, which the view does not
 * dual-read, and for tidying the 5e duplicates away so the same fact is not
 * recorded in two places waiting to drift apart again.
 *
 *   npm run migrate:sheet-fields -- --dry-run    # report, change nothing
 *   npm run migrate:sheet-fields                 # apply
 *
 * Safe to run more than once: a sheet already on the new fields is skipped, and
 * a partial run simply continues where it left off. Nothing is deleted until
 * its content has been merged into the field that replaces it, and each
 * character is written in its own transaction, so an interruption cannot leave
 * one half-converted.
 *
 * **A player's typed text is never parsed.** Strings become names, whole. See
 * utils/featureEntries for why.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { collectSheetFeatures, readFeatureEntries } from '../utils/featureEntries';

const prisma = new PrismaClient();

type Sheet = Record<string, unknown>;

interface Change {
  character: string;
  system: string;
  notes: string[];
}

/** Is this a plain object we can treat as a sheet? */
function isSheet(value: unknown): value is Sheet {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A non-empty array, or null. */
function arrayOrNull(value: unknown): unknown[] | null {
  return Array.isArray(value) && value.length > 0 ? value : null;
}

/** Trimmed string, or null if absent or blank. */
function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Take the text entries of `source` that are not already accounted for.
 *
 * `seen` holds the lower-cased entries the destination already has and is added
 * to as it goes, so two sources merged in turn cannot introduce a duplicate
 * between them.
 *
 * The `unmergeable` count is what makes deleting the source safe to decide:
 * an entry that is not usable text has nowhere to go in a list of strings, and
 * a source still holding one must be kept rather than dropped.
 */
function absorbTextEntries(
  source: readonly unknown[],
  seen: Set<string>
): { added: string[]; unmergeable: number } {
  const added: string[] = [];
  let unmergeable = 0;

  for (const entry of source) {
    if (typeof entry !== 'string') {
      unmergeable += 1;
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed) continue; // Blank: nothing to lose by dropping it.
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue; // Already in the destination.
    seen.add(key);
    added.push(trimmed);
  }

  return { added, unmergeable };
}

/**
 * D&D 5e. Fold the template-era fields into the ones the sheet reads.
 *
 * `featuresAndTraits` is normalised even when there is nothing to merge, so a
 * sheet ends up holding named entries rather than a mix of shapes across the
 * instance.
 */
export function migrateDnD5e(sheet: Sheet, notes: string[]): Sheet {
  const next: Sheet = { ...sheet };

  const features = collectSheetFeatures(sheet);
  if (features.length > 0 || 'features' in next) {
    const recovered = readFeatureEntries(sheet.features).length;
    next.featuresAndTraits = features;
    if (recovered > 0) notes.push(`recovered ${recovered} feature(s) from 'features'`);
    delete next.features;
  }

  // `proficiencies` (a flat list) plus `languages` become one list. A sheet
  // saved through the editor has `proficiencies` as a structured object
  // instead; that one belongs to the editor's four text boxes and is left
  // alone — it is already folded into proficienciesAndLanguages on save.
  const flatProficiencies = Array.isArray(sheet.proficiencies) ? sheet.proficiencies : null;
  const languages = arrayOrNull(sheet.languages);
  if (flatProficiencies || languages) {
    const existing = arrayOrNull(sheet.proficienciesAndLanguages) ?? [];

    // Existing entries are kept exactly as they are, malformed ones included,
    // and only genuinely new text is appended. Judging the merge by comparing
    // list lengths asked the wrong question: a destination that already held a
    // case-variant duplicate — or anything that was not a string — produced a
    // result no longer than what was there, so the merge was written off as a
    // no-op and skipped while the sources were deleted regardless, taking
    // entries that existed nowhere else with them.
    const seen = new Set(
      existing
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim().toLowerCase())
    );
    const fromProficiencies = absorbTextEntries(flatProficiencies ?? [], seen);
    const fromLanguages = absorbTextEntries(languages ?? [], seen);
    const additions = [...fromProficiencies.added, ...fromLanguages.added];

    if (additions.length > 0) {
      next.proficienciesAndLanguages = [...existing, ...additions];
      notes.push(`merged ${additions.length} proficiency/language entries`);
    }

    // A source is dropped only once everything in it is either already in the
    // destination or was just added to it.
    if (flatProficiencies && fromProficiencies.unmergeable === 0) delete next.proficiencies;
    if (fromLanguages.unmergeable === 0) delete next.languages;

    const kept = fromProficiencies.unmergeable + fromLanguages.unmergeable;
    if (kept > 0) notes.push(`kept ${kept} entr${kept === 1 ? 'y' : 'ies'} that are not text`);
  }

  // Four loose strings become the `personality` object the sheet renders.
  const personalityParts = {
    traits: textOrNull(sheet.personalityTraits),
    ideals: textOrNull(sheet.ideals),
    bonds: textOrNull(sheet.bonds),
    flaws: textOrNull(sheet.flaws),
  };
  const hasLoosePersonality = Object.values(personalityParts).some((v) => v !== null);
  if (hasLoosePersonality || 'personalityTraits' in next) {
    const existing = isSheet(sheet.personality) ? sheet.personality : {};
    const merged: Sheet = { ...existing };
    let filled = 0;
    for (const [key, value] of Object.entries(personalityParts)) {
      if (value && !textOrNull(merged[key])) {
        merged[key] = value;
        filled += 1;
      }
    }
    if (filled > 0) {
      next.personality = merged;
      notes.push(`moved ${filled} personality field(s)`);
    }
    delete next.personalityTraits;
    delete next.ideals;
    delete next.bonds;
    delete next.flaws;
  }

  const allies = textOrNull(sheet.allies);
  if (allies || 'allies' in next) {
    const existing = isSheet(sheet.alliesAndOrganizations) ? sheet.alliesAndOrganizations : {};
    if (allies && !textOrNull(existing.name)) {
      next.alliesAndOrganizations = { ...existing, name: allies };
      notes.push('moved allies into alliesAndOrganizations');
    }
    delete next.allies;
  }

  return next;
}

/** Pathfinder 2e. `attacks` are strikes; `specialAbilities` are class features. */
export function migratePathfinder2e(sheet: Sheet, notes: string[]): Sheet {
  const next: Sheet = { ...sheet };

  const attacks = arrayOrNull(sheet.attacks);
  if (attacks || 'attacks' in next) {
    if (attacks && !arrayOrNull(sheet.strikes)) {
      // The schema separates the melee/ranged kind (`type`) from a numeric
      // reach (`range`); the old shape put the kind in `range` as a word.
      next.strikes = attacks.map((raw) => {
        if (!isSheet(raw)) return raw;
        const strike: Sheet = { ...raw };
        if (strike.range === 'melee' || strike.range === 'ranged') {
          strike.type = strike.range;
          delete strike.range;
        }
        return strike;
      });
      notes.push(`moved ${attacks.length} attack(s) to strikes`);
    }
    delete next.attacks;
  }

  const special = arrayOrNull(sheet.specialAbilities);
  if (special || 'specialAbilities' in next) {
    if (special) {
      const merged = readFeatureEntries([
        ...(arrayOrNull(sheet.classFeatures) ?? []),
        ...special,
      ]);
      next.classFeatures = merged;
      notes.push(`moved ${special.length} special ability/abilities to classFeatures`);
    }
    delete next.specialAbilities;
  }

  // Duplicates of fields that live inside `hp` and `perception`. The nested
  // copies are the ones the sheet reads; these top-level ones never were.
  for (const stray of ['senses', 'resistances', 'immunities']) {
    if (stray in next) {
      delete next[stray];
      notes.push(`dropped stray top-level '${stray}'`);
    }
  }

  return next;
}

/** Call of Cthulhu 7e. `player` is the schema's `playerName`. */
export function migrateCallOfCthulhu(sheet: Sheet, notes: string[]): Sheet {
  const next: Sheet = { ...sheet };
  const player = textOrNull(sheet.player);
  if (player || 'player' in next) {
    if (player && !textOrNull(sheet.playerName)) {
      next.playerName = player;
      notes.push('moved player to playerName');
    }
    delete next.player;
  }
  return next;
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

// Only run when invoked directly, so the transforms above can be imported
// by tests without opening a database connection.
if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
