/**
 * Carry a refused save's changes onto the newest version of a character.
 *
 * A save made from a version of a character that has changed since is refused
 * (409), so that it cannot put back what changed: hit points taken at the
 * table, say. The user's own changes are the difference between the version
 * their editor opened and what they tried to save. This puts that difference
 * onto the newest version and leaves everything else as the newest version
 * has it. Where the same field changed in both, nothing is guessed: the field
 * is reported as a conflict, the newest value is kept until the user chooses,
 * and `withChoices` applies the choice.
 *
 * List entries are followed by position only while the list has the same
 * length in all three versions. A list whose length changed is one value: the
 * user's whole list is taken when the newest version left it alone, and it is
 * a conflict when both changed it, because a position no longer names the same
 * entry.
 *
 * Pure, and never changes what it is given.
 */

export type EditPath = (string | number)[];

/** A change of the user's, carried onto the newest version. */
export interface ReappliedEdit {
  path: EditPath;
  /** The user's value; `undefined` when they removed the field. */
  mine: unknown;
}

/** A field the user changed that also changed in the newest version. */
export interface EditConflict {
  path: EditPath;
  mine: unknown;
  theirs: unknown;
}

export interface Reapplied<T> {
  /** The newest version with the user's changes on it; conflicts keep the newest value. */
  merged: T;
  applied: ReappliedEdit[];
  conflicts: EditConflict[];
}

type Plain = Record<string, unknown>;

function isPlain(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keys of all the objects given, in first-seen order. */
function keysOf(...objects: Plain[]): string[] {
  const keys = new Set<string>();
  for (const object of objects) {
    for (const key of Object.keys(object)) keys.add(key);
  }
  return [...keys];
}

/** Structural equality for JSON values. A key holding `undefined` counts as absent. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  if (isPlain(a) && isPlain(b)) {
    return keysOf(a, b).every((key) => sameValue(a[key], b[key]));
  }
  return false;
}

/** The leaf-level changes from `before` to `after`, by the same list rule as the merge. */
function changesBetween(path: EditPath, before: unknown, after: unknown, out: ReappliedEdit[]): void {
  if (sameValue(before, after)) return;
  if (isPlain(before) && isPlain(after)) {
    for (const key of keysOf(before, after)) changesBetween([...path, key], before[key], after[key], out);
    return;
  }
  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    after.forEach((item, i) => changesBetween([...path, i], before[i], item, out));
    return;
  }
  out.push({ path, mine: after });
}

function merge(
  path: EditPath,
  opened: unknown,
  edited: unknown,
  latest: unknown,
  applied: ReappliedEdit[],
  conflicts: EditConflict[],
): unknown {
  // Not touched by the user, or already as the user wants it.
  if (sameValue(opened, edited) || sameValue(edited, latest)) return latest;
  // Changed only by the user.
  if (sameValue(opened, latest)) {
    changesBetween(path, opened, edited, applied);
    return edited;
  }
  // Changed on both sides: look inside where the shapes allow it.
  if (isPlain(opened) && isPlain(edited) && isPlain(latest)) {
    const result: Plain = {};
    for (const key of keysOf(latest, edited, opened)) {
      const value = merge([...path, key], opened[key], edited[key], latest[key], applied, conflicts);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  if (
    Array.isArray(opened) && Array.isArray(edited) && Array.isArray(latest) &&
    opened.length === edited.length && edited.length === latest.length
  ) {
    return latest.map((item, i) => merge([...path, i], opened[i], edited[i], item, applied, conflicts));
  }
  conflicts.push({ path, mine: edited, theirs: latest });
  return latest;
}

export function reapplyEdits<T>(opened: T, edited: T, latest: T): Reapplied<T> {
  const applied: ReappliedEdit[] = [];
  const conflicts: EditConflict[] = [];
  const merged = merge([], opened, edited, latest, applied, conflicts) as T;
  return { merged, applied, conflicts };
}

/** `value` with `replacement` at `path`, copying each level on the way down. */
function setAt(value: unknown, path: EditPath, replacement: unknown): unknown {
  if (path.length === 0) return replacement;
  const [head, ...rest] = path;
  if (Array.isArray(value) && typeof head === 'number') {
    const copy = [...value];
    copy[head] = setAt(value[head], rest, replacement);
    return copy;
  }
  const copy: Plain = isPlain(value) ? { ...value } : {};
  const next = setAt(copy[String(head)], rest, replacement);
  if (next === undefined) delete copy[String(head)];
  else copy[String(head)] = next;
  return copy;
}

/**
 * The merged sheet with the user's choice applied to each conflict:
 * `keepMine[i]` true keeps the user's value for `conflicts[i]`.
 */
export function withChoices<T>(result: Reapplied<T>, keepMine: boolean[]): T {
  let sheet: unknown = result.merged;
  result.conflicts.forEach((conflict, i) => {
    if (keepMine[i]) sheet = setAt(sheet, conflict.path, conflict.mine);
  });
  return sheet as T;
}

const WORDS: Record<string, string> = {
  hp: 'HP',
  ac: 'AC',
  dc: 'DC',
  xp: 'XP',
};

/** "hitDice" → "Hit dice"; an all-capitals key such as "STR" stays as it is. */
function fieldWords(key: string): string {
  if (WORDS[key.toLowerCase()]) return WORDS[key.toLowerCase()];
  if (key === key.toUpperCase()) return key;
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The name a list entry goes by, if it carries one. */
function entryName(entry: unknown): string | null {
  if (!isPlain(entry)) return null;
  for (const key of ['name', 'title', 'class', 'label']) {
    const value = entry[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

/**
 * A field's place on the sheet in words, for telling the user what changed:
 * "Inventory › Torch › Quantity". A list entry is named by its own name in
 * `sheet` where it has one, and by its position otherwise.
 */
export function describePath(path: EditPath, sheet: unknown): string {
  const parts: string[] = [];
  let node: unknown = sheet;
  for (const segment of path) {
    if (typeof segment === 'number') {
      const entry = Array.isArray(node) ? node[segment] : undefined;
      parts.push(entryName(entry) ?? `Entry ${segment + 1}`);
      node = entry;
    } else {
      parts.push(fieldWords(segment));
      node = isPlain(node) ? node[segment] : undefined;
    }
  }
  return parts.join(' › ');
}

const MAX_SHOWN = 120;

function shorten(text: string): string {
  return text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN)}…` : text;
}

/** A value as the user would recognise it, in one short line. */
export function describeValue(value: unknown): string {
  if (value === undefined) return '(removed)';
  if (value === null) return '(empty)';
  if (typeof value === 'string') return value === '' ? '(empty)' : shorten(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty list)';
    const items = value.map((item) =>
      typeof item === 'string' || typeof item === 'number' ? String(item) : entryName(item)
    );
    if (items.every((item): item is string => item !== null)) return shorten(items.join(', '));
    return value.length === 1 ? '1 entry' : `${value.length} entries`;
  }
  if (isPlain(value)) {
    const name = entryName(value);
    if (name) return shorten(name);
    const parts = Object.entries(value)
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      .map(([k, v]) => `${fieldWords(k)}: ${describeValue(v)}`);
    return parts.length > 0 ? shorten(parts.join(', ')) : '(changed)';
  }
  return shorten(String(value));
}
