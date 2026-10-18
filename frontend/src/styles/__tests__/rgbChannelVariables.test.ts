/**
 * A theme's `--rgb-*` variables hold bare channels ("74 93 78"), not colours,
 * so a stylesheet must wrap them, as `rgb(var(--rgb-brand-ink))`. The note
 * styles used them as colours, and those rules never applied: notes took
 * the surrounding text colour and their links were not blue. This reads
 * every stylesheet for one used bare.
 */

import { it, expect } from 'vitest';

const stylesheets = import.meta.glob<string>('/src/**/*.css', { query: '?raw', import: 'default', eager: true });

it('reads the stylesheets as text, so the check is looking at the right files', () => {
  // Vitest reads a stylesheet as empty unless vitest.config.ts includes it.
  expect(stylesheets['/src/styles/note-markdown.css']).toContain('.prose-notes');
  expect(stylesheets['/src/index.css']).toContain('--rgb-brand-ink');
});

it('wraps every --rgb-* variable in rgb()', () => {
  const bare = Object.entries(stylesheets).flatMap(([file, source]) =>
    source.split('\n').flatMap((line, i) =>
      /(?<!rgba?\()var\(--rgb-/.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : []));
  expect(bare).toEqual([]);
});
