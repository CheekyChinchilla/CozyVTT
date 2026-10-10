/**
 * Every component that renders with the prose-notes class imports its styles.
 *
 * The rules live in note-markdown.css, and every page is loaded on demand, so
 * a stylesheet arrives only with a component that imports it. The document
 * reader used the class without importing the file, so a Markdown document
 * opened from the Documents page showed plain headings, unbulleted lists and
 * borderless tables, and looked right inside a campaign only because the
 * Notes panel had already loaded the styles.
 */
import { describe, it, expect } from 'vitest';

const sources = import.meta.glob<string>(['/src/**/*.tsx', '!/src/**/__tests__/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const usesClass = (source: string) => /\bprose-notes\b/.test(source);
const importsStyles = (source: string) => /import\s+['"][^'"]*note-markdown\.css['"]/.test(source);

describe('the prose-notes styles', () => {
  const users = Object.entries(sources).filter(([, source]) => usesClass(source));

  it('are used somewhere, so this check is looking at the right files', () => {
    expect(users.length).toBeGreaterThan(0);
  });

  it.each(users.map(([file]) => file))('are imported by %s, which uses the class', (file) => {
    expect(importsStyles(sources[file])).toBe(true);
  });
});
