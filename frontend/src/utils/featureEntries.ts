/**
 * Reading a D&D 5e sheet's features and traits, whatever shape they are in.
 *
 * ---------------------------------------------------------------------------
 * DUPLICATED FILE — these two copies must stay byte-for-byte identical:
 *   backend/src/utils/featureEntries.ts
 *   frontend/src/utils/featureEntries.ts
 * ---------------------------------------------------------------------------
 * The two projects share no package. A parity test in the backend suite
 * compares the files and fails on any difference, so drift breaks the build
 * rather than quietly making the migration and the editor disagree about a
 * player's sheet. Edit one, copy it to the other.
 *
 * Three shapes exist in the wild and all three have to keep working:
 *
 *   1. `featuresAndTraits: string[]` — what the editor has always written. The
 *      field is a comma-separated textbox, so these are whatever the player
 *      typed: "NakuDama-Amphibious", "Aspiring Shadow Warrior". They are names,
 *      with no description, and frequently contain punctuation.
 *   2. `features: [{ name, description }]` — what the built-in templates write.
 *      Nothing ever read it, which is the bug this all comes from, so the
 *      descriptions on it have never been seen by anyone.
 *   3. Both at once, on a character made from a template and then edited.
 *
 * **A player's string is never parsed.** The whole string becomes the name and
 * the description is left empty. Splitting on a hyphen or a colon would turn
 * "NakuDama-Amphibious" into a feature called "NakuDama" described as
 * "Amphibious", and there is no way to tell that apart from a genuine
 * "Second Wind: regain 1d10 hit points". Guessing would corrupt real sheets to
 * make a handful of built-in ones prettier, so nothing is guessed.
 */

/** One feature or trait. `description` is empty for anything a player typed. */
export interface FeatureEntry {
  name: string;
  description: string;
}

/** How the editor has always split its comma-separated textbox. */
function splitTypedList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Coerce one unknown array element into an entry, or null if it is unusable. */
function toEntry(raw: unknown): FeatureEntry | null {
  if (typeof raw === 'string') {
    const name = raw.trim();
    return name ? { name, description: '' } : null;
  }

  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) return null;
    const description =
      typeof record.description === 'string' ? record.description.trim() : '';
    return { name, description };
  }

  return null;
}

/**
 * Read one field into entries. Accepts a string (the raw textbox contents), an
 * array of strings, an array of objects, or a mixture; anything else reads as
 * empty rather than throwing, because this runs over sheets written by every
 * version the project has ever shipped.
 */
export function readFeatureEntries(value: unknown): FeatureEntry[] {
  if (typeof value === 'string') {
    return splitTypedList(value).map((name) => ({ name, description: '' }));
  }
  if (!Array.isArray(value)) return [];
  return value.map(toEntry).filter((entry): entry is FeatureEntry => entry !== null);
}

/**
 * Read one field into entries **for an editor**, keeping rows that have no name.
 *
 * `readFeatureEntries` discards nameless entries, which is right for storage and
 * wrong here: a row the user has just added and not yet typed into has no name
 * by definition, and dropping it makes the "Add Feature" button appear to do
 * nothing. Names are left untrimmed for the same reason — trimming as somebody
 * types would eat the space before every second word.
 *
 * Blank rows are removed by `readFeatureEntries` on save, so they never reach
 * the database.
 */
export function readFeatureEntriesForEditing(value: unknown): FeatureEntry[] {
  if (typeof value === 'string') {
    return splitTypedList(value).map((name) => ({ name, description: '' }));
  }
  if (!Array.isArray(value)) return [];

  return value.map((raw) => {
    if (typeof raw === 'string') return { name: raw, description: '' };
    if (raw && typeof raw === 'object') {
      const record = raw as Record<string, unknown>;
      return {
        name: typeof record.name === 'string' ? record.name : '',
        description: typeof record.description === 'string' ? record.description : '',
      };
    }
    return { name: '', description: '' };
  });
}

/**
 * Merge feature lists, keeping the first occurrence of each name.
 *
 * Names are matched case-insensitively after trimming, so a player who typed
 * "second wind" does not end up with it twice once the template's copy is
 * folded in. Where the same feature appears with and without a description, the
 * description is kept — that is the whole point of the merge, and it never
 * overwrites a name the player chose.
 *
 * Order follows the arguments, so callers put what the player already sees
 * first and everything being restored after it.
 */
export function mergeFeatureEntries(...lists: FeatureEntry[][]): FeatureEntry[] {
  const merged: FeatureEntry[] = [];
  const indexByName = new Map<string, number>();

  for (const list of lists) {
    for (const entry of list) {
      const key = entry.name.trim().toLowerCase();
      const existing = indexByName.get(key);

      if (existing === undefined) {
        indexByName.set(key, merged.length);
        merged.push(entry);
        continue;
      }

      // Same feature seen again: take a description if we did not have one.
      if (!merged[existing].description && entry.description) {
        merged[existing] = { ...merged[existing], description: entry.description };
      }
    }
  }

  return merged;
}

/**
 * The features of a sheet, from both the field the editor writes and the one
 * the templates write.
 *
 * What the player currently sees comes first: `featuresAndTraits` is the field
 * the sheet has always displayed, so preserving its order preserves their list
 * exactly. Template entries follow, which is new content appearing on sheets
 * where it had been stored but never shown.
 */
export function collectSheetFeatures(sheet: unknown): FeatureEntry[] {
  if (!sheet || typeof sheet !== 'object') return [];
  const record = sheet as Record<string, unknown>;
  return mergeFeatureEntries(
    readFeatureEntries(record.featuresAndTraits),
    readFeatureEntries(record.features)
  );
}

/**
 * Whether a sheet already holds its features in the object form, so a migration
 * can skip it and stay safe to re-run.
 */
export function alreadyMigrated(sheet: unknown): boolean {
  if (!sheet || typeof sheet !== 'object') return false;
  const record = sheet as Record<string, unknown>;
  if ('features' in record) return false;
  const value = record.featuresAndTraits;
  if (!Array.isArray(value)) return false;
  return value.every(
    (entry) => entry !== null && typeof entry === 'object' && !Array.isArray(entry)
  );
}
