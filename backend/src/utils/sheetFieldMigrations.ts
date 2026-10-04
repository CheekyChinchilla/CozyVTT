/**
 * Moving a character sheet's fields from where older versions kept them to
 * where the sheet reads them now.
 *
 * The built-in templates of versions before 1.3.0 were written against an
 * older shape, so sheets made from them carry content in fields that were
 * later renamed or folded into others. `npm run migrate:sheet-fields` applies
 * these to every stored sheet; the character routes apply them to every sheet
 * they are sent, before validation, because the schema drops a field it does
 * not declare and the content would otherwise be lost on the first save.
 *
 * Safe to apply more than once: a sheet already on the new fields comes back
 * unchanged. Nothing is dropped until its content has been merged into the
 * field that replaces it.
 *
 * **A player's typed text is never parsed.** Strings become names, whole. See
 * utils/featureEntries for why.
 */

import { collectSheetFeatures, readFeatureEntries } from './featureEntries';

export type Sheet = Record<string, unknown>;

/** Is this a plain object we can treat as a sheet? */
export function isSheet(value: unknown): value is Sheet {
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

    // A sheet that also has the four boxes (a 1.2.2 sheet edited on 1.3.0 or
    // 1.4.0) is read from the boxes, so its languages go in the Languages box
    // too. In the flat list alone they would not be shown, and the next save,
    // which rebuilds that list from the boxes, would drop them.
    const boxes = isSheet(sheet.proficiencies) ? sheet.proficiencies : null;
    if (boxes && fromLanguages.added.length > 0) {
      const typed = typeof boxes.languages === 'string' ? boxes.languages : '';
      next.proficiencies = {
        ...boxes,
        languages: [typed, ...fromLanguages.added].filter((part) => part.trim()).join(', '),
      };
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

/**
 * Keys that only a sheet written before 1.3.0 carries, for each system. A sheet
 * holding none of them is left exactly as it was sent.
 */
function hasLegacyFields(gameSystem: string, sheet: Sheet): boolean {
  switch (gameSystem) {
    case 'DND_5E':
      return (
        ['features', 'languages', 'personalityTraits', 'ideals', 'bonds', 'flaws', 'allies'].some((key) => key in sheet) ||
        Array.isArray(sheet.proficiencies)
      );
    case 'PATHFINDER_2E':
      return ['attacks', 'specialAbilities', 'senses', 'resistances', 'immunities'].some((key) => key in sheet);
    case 'CALL_OF_CTHULHU_7E':
      return 'player' in sheet;
    default:
      return false;
  }
}

/**
 * A sheet with any pre-1.3.0 fields moved to where the sheet reads them.
 *
 * Anything that is not a sheet, a system with no older shape, and a sheet with
 * no older fields come back as they were, the same value.
 */
export function migrateLegacySheetFields(gameSystem: string | null | undefined, data: unknown): unknown {
  if (!gameSystem || !isSheet(data) || !hasLegacyFields(gameSystem, data)) return data;
  const notes: string[] = [];
  switch (gameSystem) {
    case 'DND_5E':
      return migrateDnD5e(data, notes);
    case 'PATHFINDER_2E':
      return migratePathfinder2e(data, notes);
    case 'CALL_OF_CTHULHU_7E':
      return migrateCallOfCthulhu(data, notes);
    default:
      return data;
  }
}
