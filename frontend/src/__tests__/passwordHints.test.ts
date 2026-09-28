/**
 * Every password hint on a page names the one rule.
 *
 * The rule is twelve characters, in PASSWORD_REQUIREMENTS; the profile page
 * kept saying eight after the rule moved, so a person typing a nine-character
 * password was told it was fine and then refused. Any length hint on a page
 * has to name the rule's length, whatever its case or wording: "At least 12
 * characters", "min 12 characters", "Minimum 12 chars", "min. 12 characters".
 */

import { describe, it, expect } from 'vitest';
import { PASSWORD_REQUIREMENTS } from '@/utils/validation';

const pages = import.meta.glob('../pages/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** The length the rule list checks, read from its own label. */
const minLength = Number(PASSWORD_REQUIREMENTS.map((r) => /(\d+) characters/.exec(r.label)?.[1]).find(Boolean));

/** A length hint in any of the forms above, in any case. */
const HINT = /\b(?:at least|minimum|min\.?)\s+(\d+)\s+(?:characters|chars)\b/gi;

/**
 * Whether the hint at `index` in `line` is about a password. A message such
 * as "Display name must be at least 2 characters" names the field it is
 * about, so one that names another field is left alone. Every other hint (a
 * placeholder, a line of help text) is taken to be about the password, so a
 * new one is checked unless it says otherwise.
 */
function aboutAPassword(line: string, index: number): boolean {
  const before = line.slice(0, index);
  if (!/\bmust (?:be|have)\s+$/i.test(before)) return true;
  return /password/i.test(before);
}

describe('password length hints on the pages', () => {
  it('all name the length the rule checks', () => {
    expect(minLength).toBeGreaterThan(0);
    const wrong: string[] = [];
    for (const [file, source] of Object.entries(pages)) {
      for (const line of source.split('\n')) {
        for (const m of line.matchAll(HINT)) {
          if (aboutAPassword(line, m.index ?? 0) && Number(m[1]) !== minLength) {
            wrong.push(`${file}: "${m[0]}"`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
