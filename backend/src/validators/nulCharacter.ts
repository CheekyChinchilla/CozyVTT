/**
 * U+0000, the null character, which PostgreSQL cannot store: a text column
 * refuses it, and so does a jsonb column, in a value or in a key, and the
 * write that carries one fails.
 *
 * One rule keeps it out. A request holding one anywhere is refused before a
 * route reads it (middleware/nulCharacter.ts, once the JSON body is parsed
 * and again once an upload's form is), and so is a live-table event
 * (websocket/events.ts). A campaign archive's data files are read without
 * it (services/campaignImporter.ts), as text too long for its field is cut
 * to fit, so one stray character costs nothing else.
 */

const NUL = '\u0000';

/** What a request or an event holding U+0000 is answered. */
export const NUL_REFUSAL = 'Text cannot contain the null character (U+0000).';

/**
 * An object as JSON or a form gives one, and so walked into. Any other
 * object, a Buffer an event carries or a Date, holds no text.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** What may hold text further in: a list or a plain object. */
function holdsMore(value: unknown): boolean {
  return Array.isArray(value) || isPlainRecord(value);
}

/**
 * Whether any text in `value`, a key included, holds U+0000. Walked with a
 * list of its own, so data nested however deeply costs no stack.
 */
export function holdsNulCharacter(value: unknown): boolean {
  if (typeof value === 'string') return value.includes(NUL);
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const holder = pending.pop();
    if (Array.isArray(holder)) {
      for (const item of holder) {
        if (typeof item === 'string') {
          if (item.includes(NUL)) return true;
        } else if (holdsMore(item)) {
          pending.push(item);
        }
      }
    } else if (isPlainRecord(holder)) {
      for (const key of Object.keys(holder)) {
        if (key.includes(NUL)) return true;
        const item = holder[key];
        if (typeof item === 'string') {
          if (item.includes(NUL)) return true;
        } else if (holdsMore(item)) {
          pending.push(item);
        }
      }
    }
  }
  return false;
}

/**
 * `value` with U+0000 taken out of every text in it, keys included, and how
 * many were taken out. Lists and objects are changed in place; text given on
 * its own is returned changed. Walked as holdsNulCharacter is.
 */
export function removeNulCharacters(value: unknown): { value: unknown; removed: number } {
  let removed = 0;
  const clean = (text: string): string => {
    const kept = text.replaceAll(NUL, '');
    removed += text.length - kept.length;
    return kept;
  };
  if (typeof value === 'string') return { value: value.includes(NUL) ? clean(value) : value, removed };

  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const holder = pending.pop();
    if (Array.isArray(holder)) {
      for (let i = 0; i < holder.length; i++) {
        const item: unknown = holder[i];
        if (typeof item === 'string') {
          if (item.includes(NUL)) holder[i] = clean(item);
        } else if (holdsMore(item)) {
          pending.push(item);
        }
      }
    } else if (isPlainRecord(holder)) {
      for (const key of Object.keys(holder)) {
        const item = holder[key];
        let kept = item;
        if (typeof item === 'string') {
          if (item.includes(NUL)) kept = clean(item);
        } else if (holdsMore(item)) {
          pending.push(item);
        }
        if (key.includes(NUL)) {
          delete holder[key];
          // Defined, never assigned: a key that reads `__proto__` once
          // cleaned stays a key, and does not become the object's prototype.
          Object.defineProperty(holder, clean(key), { value: kept, enumerable: true, writable: true, configurable: true });
        } else if (kept !== item) {
          holder[key] = kept;
        }
      }
    }
  }
  return { value, removed };
}
