/**
 * The width below which the campaign page changes for a narrow screen is
 * written once.
 *
 * The campaign page asks it of the browser, and whatever else changes with the
 * page must ask the same. Written in each of them it would drift, and a phone
 * would get the narrow page with a panel laid out for a wide one. The campaign
 * page's classes ask it of Tailwind too (`lg:`, which Tailwind writes as
 * `(width >= <--breakpoint-lg>)`), so the query must be the exact complement
 * of `lg`, in its unit. A rem in a media query is the browser's default text
 * size, which its user sets, so a width in px agreed with `lg` only at 16 px:
 * at 12 px the Desktop Required notice was hidden while its focus trap held
 * the keyboard, and at 20 px it was shown with no trap.
 */
import { describe, it, expect } from 'vitest';
import tailwindTheme from 'tailwindcss/theme.css?raw';
import { COMPACT_LAYOUT_QUERY } from '../layout';

// Every source and stylesheet of the app, tests aside.
const SOURCES = Object.fromEntries(
  Object.entries(
    import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '/src/**/*.css', '!/src/**/__tests__/**'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
  ).filter(([file]) => !file.includes('/__tests__/'))
);

const HOME = '/src/constants/layout.ts';

// The ways a second copy of the width would be written: a media query in px,
// rem or em, in the old syntax or the range syntax, asking narrow or wide, or
// the window's width tested in code.
const PX = String.raw`(?:102[34]|1023\.\d+)\s*px`;
const SECOND_COPY = [
  new RegExp(String.raw`\b1023\.\d+`),
  new RegExp(String.raw`(?:min|max)-width\s*:\s*` + PX),
  new RegExp(String.raw`width\s*[<>]=?\s*` + PX),
  new RegExp(PX + String.raw`\s*[<>]=?\s*width`),
  /\b64r?em\b/,
  /(?:inner|outer|client)Width\s*[<>]=?\s*102[34]\b/,
  /\b102[34]\s*[<>]=?\s*[\w.]*(?:inner|outer|client)Width/,
];
const writesTheWidth = (source: string) => SECOND_COPY.some((pattern) => pattern.test(source));

describe('the compact layout query', () => {
  it('is written in one file, which every other file imports', () => {
    const writers = Object.entries(SOURCES)
      .filter(([file, source]) => file !== HOME && writesTheWidth(source))
      .map(([file]) => file);
    expect(writers).toEqual([]);
  });

  it('would find the width written again in any of the usual ways', () => {
    for (const second of [
      "useMediaQuery('(max-width: 1023.98px)')",
      "useMediaQuery('(min-width: 1024px)')",
      "matchMedia('(width >= 1024px)')",
      "matchMedia('(1024px <= width)')",
      '@media (max-width: 64rem) {',
      '@custom-variant wide (@media (min-width: 64em));',
      'if (window.innerWidth < 1024) return;',
      'const wide = 1024 <= document.documentElement.clientWidth;',
    ]) expect(writesTheWidth(second), second).toBe(true);
    for (const other of ['1024 * 1024', 'optimized for desktop screens (1024px+)', 'max-w-[calc(100%-2rem)]', "'(pointer: coarse)'"]) {
      expect(writesTheWidth(other), other).toBe(false);
    }
  });

  // Only that the page reads the constant: where it asks the browser may
  // move, into a context of its own.
  it('is the query the campaign page asks', () => {
    expect(SOURCES['/src/pages/CampaignPage.tsx']).toMatch(
      /import \{[^}]*\bCOMPACT_LAYOUT_QUERY\b[^}]*\} from '@\/constants\/layout'/
    );
  });

  it("is the exact complement of Tailwind's lg, in lg's own unit", () => {
    const breakpointLg = (css: string) => [...css.matchAll(/--breakpoint-lg\s*:\s*([^;}]+)/g)].map((m) => m[1].trim());
    const [tailwinds] = breakpointLg(tailwindTheme);
    expect(tailwinds).toBeDefined();
    // An app stylesheet that sets it moves lg, and the query must follow.
    const overrides = Object.entries(SOURCES)
      .filter(([file]) => file.endsWith('.css'))
      .flatMap(([, css]) => breakpointLg(css));
    const lg = overrides.length > 0 ? overrides[overrides.length - 1] : tailwinds;
    expect(COMPACT_LAYOUT_QUERY).toBe(`(width < ${lg})`);
  });
});
