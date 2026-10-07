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
 * unchanged. An old field is dropped only once everything in it is in the
 * field that replaces it, whether it was there already or has just been added.
 * Anything with nowhere to go, such as a second player name or an entry that
 * is not text, leaves its old field where it is, with a note saying so, so the
 * one-off script can list it for someone to look at.
 *
 * **A player's typed text is never parsed.** Strings become names, whole. See
 * utils/featureEntries for why.
 */

import { collectSheetFeatures, mergeFeatureEntries, readFeatureEntries } from './featureEntries';

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

/** Whether a value holds nothing that could be lost: absent, null or blank text. */
function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim());
}

/**
 * An older text field read for moving: its text, null when it holds nothing,
 * or undefined when it holds something that is not text and so cannot be moved
 * into a text field.
 */
function legacyText(value: unknown): string | null | undefined {
  if (isBlank(value)) return null;
  return typeof value === 'string' ? value.trim() : undefined;
}

/** Whether `text` already appears in `existing`, ignoring case and surrounding space. */
function holdsText(existing: string, text: string): boolean {
  return existing.toLowerCase().includes(text.trim().toLowerCase());
}

/** `existing` with `added` after it as a new paragraph. */
function withParagraph(existing: string, added: string): string {
  return `${existing.trimEnd()}\n\n${added}`;
}

/** The plural of "entry" a note needs. */
function entries(count: number): string {
  return count === 1 ? '1 entry' : `${count} entries`;
}

/**
 * How many entries of a feature list the feature reader cannot read and that
 * still hold something: an entry with a description but no name, a number. A
 * blank row is not counted, since dropping it loses nothing.
 */
function unreadableFeatureEntries(value: unknown): number {
  if (!Array.isArray(value)) return isBlank(value) ? 0 : 1;
  return value.filter((entry) => {
    if (readFeatureEntries([entry]).length > 0 || isBlank(entry)) return false;
    if (isSheet(entry)) return Object.values(entry).some((field) => !isBlank(field));
    return true;
  }).length;
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
    // Every entry the reader can read is in featuresAndTraits now: the merge
    // keeps one whose name repeats and whose text differs.
    const unreadable = 'features' in sheet ? unreadableFeatureEntries(sheet.features) : 0;
    if (unreadable > 0) {
      notes.push(`kept 'features': ${entries(unreadable)} with no name to move`);
    } else {
      delete next.features;
    }
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

  // Four loose strings become the `personality` object the sheet renders. A
  // field the player has already written keeps its text first, with the older
  // text after it unless it already says the same.
  const personalityKeys = { traits: 'personalityTraits', ideals: 'ideals', bonds: 'bonds', flaws: 'flaws' } as const;
  const looseKeys = Object.values(personalityKeys);
  if (looseKeys.some((key) => key in next)) {
    const destination = sheet.personality;
    const unmovable = looseKeys.filter((key) => legacyText(sheet[key]) === undefined);
    if (!isBlank(destination) && !isSheet(destination)) {
      notes.push(`kept the older personality fields: 'personality' is not a set of fields to put them in`);
    } else {
      const merged: Sheet = { ...(isSheet(destination) ? destination : {}) };
      let filled = 0;
      let added = 0;
      for (const [field, key] of Object.entries(personalityKeys)) {
        const text = legacyText(sheet[key]);
        if (!text) continue;
        const current = typeof merged[field] === 'string' ? (merged[field] as string) : '';
        if (!current.trim()) {
          merged[field] = text;
          filled += 1;
        } else if (!holdsText(current, text)) {
          merged[field] = withParagraph(current, text);
          added += 1;
        }
      }
      if (filled + added > 0) next.personality = merged;
      if (filled > 0) notes.push(`moved ${filled} personality field(s)`);
      if (added > 0) notes.push(`added ${added} older personality field(s) after the player's own text`);
      for (const key of looseKeys) {
        if (!unmovable.includes(key)) delete next[key];
      }
      if (unmovable.length > 0) notes.push(`kept ${unmovable.map((key) => `'${key}'`).join(', ')}: not text`);
    }
  }

  if ('allies' in next) {
    const text = legacyText(sheet.allies);
    const destination = sheet.alliesAndOrganizations;
    if (text === undefined) {
      notes.push(`kept 'allies': not text`);
    } else if (text && !isBlank(destination) && !isSheet(destination)) {
      notes.push(`kept 'allies': 'alliesAndOrganizations' is not a set of fields to put it in`);
    } else {
      if (text) {
        const existing = isSheet(destination) ? destination : {};
        const name = typeof existing.name === 'string' ? existing.name : '';
        const description = typeof existing.description === 'string' ? existing.description : '';
        if (!name.trim()) {
          next.alliesAndOrganizations = { ...existing, name: text };
          notes.push('moved allies into alliesAndOrganizations');
        } else if (!holdsText(name, text) && !holdsText(description, text)) {
          next.alliesAndOrganizations = {
            ...existing,
            description: description.trim() ? withParagraph(description, text) : text,
          };
          notes.push("added the older allies after the player's own description");
        }
      }
      delete next.allies;
    }
  }

  return next;
}

/** A 1.2.2 attack as a strike: the melee/ranged word moves from `range` to `type`. */
function attackAsStrike(attack: Sheet): Sheet {
  // The schema separates the melee/ranged kind (`type`) from a numeric reach
  // (`range`); the old shape put the kind in `range` as a word.
  const strike: Sheet = { ...attack };
  if (strike.range === 'melee' || strike.range === 'ranged') {
    strike.type = strike.range;
    delete strike.range;
  }
  return strike;
}

/** Where the top-level copies of nested Pathfinder 2e lists belong. */
const PF2E_NESTED_LISTS = {
  senses: ['perception', 'senses'],
  resistances: ['hp', 'resistances'],
  immunities: ['hp', 'immunities'],
} as const;

/**
 * Pathfinder 2e. `attacks` are strikes; `specialAbilities` are class features;
 * top-level senses, resistances and immunities belong in the nested lists.
 */
export function migratePathfinder2e(sheet: Sheet, notes: string[]): Sheet {
  const next: Sheet = { ...sheet };

  // Attacks are added after the player's strikes, skipping any a strike of the
  // same name already covers. One with no name has nothing to be a strike by.
  if ('attacks' in next) {
    const attacks = sheet.attacks;
    const strikes = sheet.strikes;
    if (isBlank(attacks) || (Array.isArray(attacks) && attacks.length === 0)) {
      delete next.attacks;
    } else if (!Array.isArray(attacks) || (!isBlank(strikes) && !Array.isArray(strikes))) {
      notes.push(`kept 'attacks': it cannot be added to the strikes`);
    } else {
      const existing = Array.isArray(strikes) ? strikes : [];
      const names = new Set(
        existing.filter(isSheet).map((strike) => textOrNull(strike.name)?.toLowerCase()).filter(Boolean)
      );
      const added: Sheet[] = [];
      let unmovable = 0;
      for (const attack of attacks) {
        const name = isSheet(attack) ? textOrNull(attack.name) : null;
        if (!isSheet(attack) || !name) {
          if (!isBlank(attack)) unmovable += 1;
          continue;
        }
        if (names.has(name.toLowerCase())) continue;
        names.add(name.toLowerCase());
        added.push(attackAsStrike(attack));
      }
      if (added.length > 0) {
        next.strikes = [...existing, ...added];
        notes.push(`moved ${added.length} attack(s) to strikes`);
      }
      if (unmovable > 0) {
        notes.push(`kept 'attacks': ${entries(unmovable)} with no name to move`);
      } else {
        delete next.attacks;
      }
    }
  }

  if ('specialAbilities' in next) {
    const special = sheet.specialAbilities;
    const destination = sheet.classFeatures;
    if (isBlank(special) || (Array.isArray(special) && special.length === 0)) {
      delete next.specialAbilities;
    } else if (
      !Array.isArray(special) ||
      (!isBlank(destination) && !Array.isArray(destination)) ||
      unreadableFeatureEntries(destination ?? []) > 0
    ) {
      notes.push(`kept 'specialAbilities': it cannot be added to the class features`);
    } else {
      const merged = mergeFeatureEntries(readFeatureEntries(destination), readFeatureEntries(special));
      next.classFeatures = merged;
      const moved = readFeatureEntries(special).length;
      if (moved > 0) notes.push(`moved ${moved} special ability/abilities to classFeatures`);
      const unmovable = unreadableFeatureEntries(special);
      if (unmovable > 0) {
        notes.push(`kept 'specialAbilities': ${entries(unmovable)} with no name to move`);
      } else {
        delete next.specialAbilities;
      }
    }
  }

  // Top-level copies of lists that live inside `perception` and `hp`. The
  // nested ones are what the sheet reads; anything only the top-level copy
  // holds is added to them first.
  for (const [stray, [parentKey, listKey]] of Object.entries(PF2E_NESTED_LISTS)) {
    if (!(stray in next)) continue;
    const raw = sheet[stray];
    const items = isBlank(raw) ? [] : Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : null;
    const parent = next[parentKey];
    const list = isSheet(parent) ? parent[listKey] : undefined;
    const pending = (items ?? []).filter((item) => !isBlank(item));

    if (items === null || (pending.length > 0 && (!isSheet(parent) || (!isBlank(list) && !Array.isArray(list))))) {
      notes.push(`kept top-level '${stray}': there is no ${parentKey}.${listKey} list to add it to`);
      continue;
    }

    if (pending.length > 0 && isSheet(parent)) {
      const existing = Array.isArray(list) ? list : [];
      const seen = new Set(
        existing.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim().toLowerCase())
      );
      const { added, unmergeable } = absorbTextEntries(pending, seen);
      if (added.length > 0) {
        next[parentKey] = { ...parent, [listKey]: [...existing, ...added] };
        notes.push(`added ${added.length} top-level '${stray}' entr${added.length === 1 ? 'y' : 'ies'} to ${parentKey}.${listKey}`);
      }
      if (unmergeable > 0) {
        notes.push(`kept top-level '${stray}': ${entries(unmergeable)} that are not text`);
        continue;
      }
    }

    delete next[stray];
    notes.push(`dropped stray top-level '${stray}'`);
  }

  return next;
}

/** Call of Cthulhu 7e. `player` is the schema's `playerName`. */
export function migrateCallOfCthulhu(sheet: Sheet, notes: string[]): Sheet {
  const next: Sheet = { ...sheet };
  if ('player' in next) {
    const player = legacyText(sheet.player);
    const current = textOrNull(sheet.playerName);
    if (player === undefined) {
      notes.push(`kept 'player': not text`);
    } else if (player && current && current.toLowerCase() !== player.toLowerCase()) {
      // Two different names, and the sheet has room for one.
      notes.push(`kept 'player' ("${player}"): playerName already holds "${current}"`);
    } else {
      if (player && !current) {
        next.playerName = player;
        notes.push('moved player to playerName');
      }
      delete next.player;
    }
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
