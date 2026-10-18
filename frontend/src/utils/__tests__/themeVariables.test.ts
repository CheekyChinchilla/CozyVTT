/**
 * The theme's colors pass through three lists that must agree: the channels
 * applyThemeColors sets on the page (`--rgb-brand: 74 93 78`), their
 * first-paint defaults in index.css, and the @theme keys that give Tailwind
 * each one as a color (`--color-brand: rgb(var(--rgb-brand))`).
 *
 * The two prefixes must stay apart. A page variable named like a Tailwind key
 * replaces that key, and Tailwind then reads bare channels as a color and
 * paints nothing: bg-brand, text-ink and the rest go blank while the build
 * passes.
 */

import { describe, it, expect, afterEach } from 'vitest';
import indexCss from '../../index.css?raw';
import { PRESET_THEMES, applyThemeColors } from '../../themes';

/** The text of the first block opened by `opener`, braces matched. */
function block(css: string, opener: string): string {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`index.css has no "${opener}"`);
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error(`"${opener}" in index.css is not closed`);
}

const theme = block(indexCss, '@theme {');
const rootDefaults = block(indexCss, ':root {');

function setOnPage(): string[] {
  applyThemeColors(PRESET_THEMES[0].colors);
  const style = document.documentElement.style;
  return Array.from({ length: style.length }, (_, i) => style.item(i)).filter((name) => name.startsWith('--'));
}

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

describe('the theme variables', () => {
  it('are set on the page under their own prefix, apart from Tailwind\'s --color-* keys', () => {
    const names = setOnPage();
    expect(names.length).toBeGreaterThan(20);
    expect(names.filter((name) => !name.startsWith('--rgb-'))).toEqual([]);
  });

  it('each have a first-paint default in index.css', () => {
    const missing = setOnPage().filter((name) => !new RegExp(`^\\s*${name}:\\s*\\d+ \\d+ \\d+;`, 'm').test(rootDefaults));
    expect(missing).toEqual([]);
  });

  it('are each given to Tailwind by an @theme key, and no key reads one the page does not set', () => {
    const names = setOnPage();
    const read = [...theme.matchAll(/rgb\(var\((--rgb-[\w-]+)\)\)/g)].map((m) => m[1]);
    expect(names.filter((name) => !read.includes(name))).toEqual([]);
    expect([...new Set(read)].filter((name) => !names.includes(name))).toEqual([]);
  });

  it('leave no @theme key reading itself', () => {
    const selfReading = [...theme.matchAll(/(--[\w-]+):[^;]*var\(\1\)/g)].map((m) => m[1]);
    expect(selfReading).toEqual([]);
  });
});
