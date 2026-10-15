/**
 * The typefaces come from this instance, never from another site.
 *
 * Every page used to load a Google Fonts stylesheet, and every theme change
 * another, so each visitor's browser told Google it was there, and an
 * instance with no internet access, as many home and LAN games are, showed
 * fallback fonts. The files are now part of the app (src/assets/fonts), and
 * these check that each family a font choice names has its files, that every
 * file the stylesheet names exists and is used, and that nothing points the
 * browser at another site for them again.
 */

import { describe, it, expect, afterEach } from 'vitest';
import fontsCss from '../assets/fonts/fonts.css?raw';
import indexHtml from '../../index.html?raw';
import { FONT_OPTIONS, applyFont } from '../themes';

/** The font files beside the stylesheet, by file name. */
const files = Object.keys(import.meta.glob('../assets/fonts/files/*.woff2')).map((p) => p.slice(p.lastIndexOf('/') + 1));

/** Each @font-face rule's family and file. */
const faces = [...fontsCss.matchAll(/@font-face \{([^}]*)\}/g)].map((m) => ({
  family: /font-family: '([^']+)'/.exec(m[1])?.[1],
  file: /url\('\.\/files\/([^']+)'\)/.exec(m[1])?.[1],
}));

/** The family a CSS font stack asks for first. */
const firstFamily = (stack: string) => /^'([^']+)'/.exec(stack)?.[1];

afterEach(() => {
  document.head.querySelectorAll('link').forEach((link) => link.remove());
});

describe('the bundled typefaces', () => {
  it('have files for the first family of every font choice', () => {
    const declared = new Set(faces.map((f) => f.family));
    const wanted = FONT_OPTIONS.flatMap((font) => [font.heading, font.body, font.mono].map(firstFamily));
    expect(wanted.filter((family) => family === undefined || !declared.has(family))).toEqual([]);
  });

  it('name only files that exist, and leave none unused', () => {
    expect(faces.length).toBeGreaterThan(0);
    const named = faces.map((f) => f.file);
    expect(named.filter((file) => file === undefined || !files.includes(file))).toEqual([]);
    expect(files.filter((file) => !named.includes(file))).toEqual([]);
  });

  it('are loaded from nowhere but this instance', () => {
    expect(fontsCss).not.toMatch(/url\((?!'\.\/files\/)/);
    expect(indexHtml).not.toMatch(/<link[^>]+href="https?:/);
    expect(JSON.stringify(FONT_OPTIONS)).not.toMatch(/https?:/);
  });

  it('switch with a theme without fetching a stylesheet from anywhere', () => {
    for (const font of FONT_OPTIONS) applyFont(font);
    expect(document.head.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(0);
    expect(document.documentElement.style.getPropertyValue('--font-heading')).toBe(FONT_OPTIONS[FONT_OPTIONS.length - 1].heading);
  });
});
