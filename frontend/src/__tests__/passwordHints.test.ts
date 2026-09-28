/**
 * Every password hint on a page names the one rule.
 *
 * The rule is twelve characters, in PASSWORD_REQUIREMENTS; the profile page
 * kept saying eight after the rule moved, so a person typing a nine-character
 * password was told it was fine and then refused. Any length hint on a page
 * has to name the rule's length, in any case and in each of the forms a
 * minimum is written in: "At least 12 characters", "min 12 characters",
 * "Minimum 12 chars", "min. 12 characters", "12 or more characters",
 * "12+ characters", and the number spelled out ("at least twelve").
 */

import { describe, it, expect } from 'vitest';
import { PASSWORD_REQUIREMENTS } from '@/utils/validation';

const pages = import.meta.glob('../pages/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** The length the rule list checks, read from its own label. */
const minLength = Number(PASSWORD_REQUIREMENTS.map((r) => /(\d+) characters/.exec(r.label)?.[1]).find(Boolean));

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, twenty: 20,
};
const NUMBER = `\\d+|${Object.keys(WORDS).join('|')}`;
const UNIT = '(?:characters|chars)\\b';

/** A length hint in any of the forms above, in any case. */
const HINT = new RegExp(
  `\\b(?:(?:at least|minimum|min\\.?)\\s+(${NUMBER})\\s+${UNIT}|(\\d+)\\s*(?:\\+|or more)\\s*${UNIT})`,
  'gi'
);

/** The length each hint in `line` names, with where it starts. */
function hintsIn(line: string): Array<{ length: number; index: number; text: string }> {
  return [...line.matchAll(HINT)].map((m) => {
    const said = (m[1] ?? m[2]).toLowerCase();
    return { length: WORDS[said] ?? Number(said), index: m.index ?? 0, text: m[0] };
  });
}

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
        for (const hint of hintsIn(line)) {
          if (aboutAPassword(line, hint.index) && hint.length !== minLength) {
            wrong.push(`${file}: "${hint.text}"`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('what counts as a length hint', () => {
  it.each([
    ['At least 12 characters', 12],
    ['min. 12 chars', 12],
    ['Use 8 or more characters', 8],
    ['8+ characters', 8],
    ['must be at least eight characters', 8],
  ])('reads "%s" as %i', (text, length) => {
    expect(hintsIn(text).map((h) => h.length)).toEqual([length]);
  });

  it('leaves a maximum alone', () => {
    expect(hintsIn('Maximum 200 characters')).toEqual([]);
  });
});
