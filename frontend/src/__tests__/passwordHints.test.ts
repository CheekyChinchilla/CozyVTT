/**
 * Every password hint on a page names the one rule.
 *
 * The rule is twelve characters, in PASSWORD_REQUIREMENTS; the profile page
 * kept saying eight after the rule moved, so a person typing a nine-character
 * password was told it was fine and then refused. Any "N characters" hint on
 * a page has to name the rule's length.
 */

import { describe, it, expect } from 'vitest';
import { PASSWORD_REQUIREMENTS } from '@/utils/validation';

const pages = import.meta.glob('../pages/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** The length the rule list checks, read from its own label. */
const minLength = Number(PASSWORD_REQUIREMENTS.map((r) => /(\d+) characters/.exec(r.label)?.[1]).find(Boolean));

describe('password length hints on the pages', () => {
  it('all name the length the rule checks', () => {
    expect(minLength).toBeGreaterThan(0);
    const wrong: string[] = [];
    for (const [file, source] of Object.entries(pages)) {
      for (const m of source.matchAll(/(?:Min|At least) (\d+) characters/g)) {
        if (Number(m[1]) !== minLength) wrong.push(`${file}: "${m[0]}"`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
