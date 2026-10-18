/**
 * A theme's `--rgb-*` variables hold bare channels ("74 93 78"), not colours,
 * so a stylesheet must wrap them, as `rgb(var(--rgb-brand-ink))`. The note
 * styles used them as colours, and those rules never applied: notes took
 * the surrounding text colour and their links were not blue. This reads
 * every stylesheet for one used bare.
 */

import { it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');

function stylesheets(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : stylesheets(full);
    return name.endsWith('.css') ? [full] : [];
  });
}

it('wraps every --rgb-* variable in rgb()', () => {
  const bare = stylesheets(SRC).flatMap((file) =>
    readFileSync(file, 'utf8').split('\n').flatMap((line, i) =>
      /(?<!rgba?\()var\(--rgb-/.test(line) ? [`${path.relative(SRC, file)}:${i + 1}: ${line.trim()}`] : []));
  expect(bare).toEqual([]);
});
