/**
 * Theme Token Guard
 *
 * Raw Tailwind palette colors (bg-red-50, text-stone-500, …) do not follow the
 * theme: an error box built from them stays pale pink on a dark theme, and grey
 * text keeps its light-mode shade on a dark panel. Every themed surface must use
 * the semantic tokens instead — see the alert and badge classes in index.css,
 * and the token list in its @theme block.
 *
 * The DM map overlays are exempt, a fixed-surface design, listed explicitly
 * so the exemption stays visible and reviewable; so are the sheets' header
 * colour presets, which are the player's choice and not the theme's.
 */

import { describe, it, expect } from 'vitest';

/**
 * Exempt:
 *  - the DM map overlays, deliberately dark panels floating over the map
 *  - each sheet's header colour presets (`colorPresets.ts`)
 */
const EXEMPT = [
  '/src/components/campaign/DmWallControls.tsx',
  '/src/components/campaign/DmLightControls.tsx',
  '/src/components/campaign/DmFogControls.tsx',
  '/src/components/campaign/DmToolPanelContainer.tsx',
];
const HEADER_COLOURS = /\/character-sheets\/[^/]+\/colorPresets\.ts$/;


/**
 * Palette families that have a semantic token to use instead. Teal and lime
 * are left out: the DM screens use them to match the map's fixed token
 * colours (friendly tokens are drawn teal).
 */
const RAW_COLOR =
  /\b(?:text|bg|border(?:-[trblxyse])?|ring|divide|placeholder|from|via|to|fill|stroke|outline|decoration|accent)-(?:red|rose|pink|fuchsia|green|emerald|amber|yellow|orange|blue|indigo|sky|cyan|purple|violet|stone|gray|slate|zinc|neutral|sepia)-\d{2,3}\b/g;

// Vite inlines every component's source at build time, so the check needs no
// filesystem access and runs in the same environment as the rest of the suite.
const SOURCES = import.meta.glob(['/src/**/*.tsx', '/src/**/*.ts', '!/src/**/__tests__/**', '!/src/**/*.test.ts', '!/src/**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('themed surfaces use semantic tokens', () => {
  const offenders = Object.entries(SOURCES)
    .filter(([path]) => !EXEMPT.some((exempt) => path.startsWith(exempt) || path === exempt))
    .filter(([path]) => !HEADER_COLOURS.test(path))
    .map(([path, source]) => ({
      file: path,
      matches: [...new Set(source.match(RAW_COLOR) ?? [])],
    }))
    .filter((entry) => entry.matches.length > 0);

  it('scans the component tree', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
  });

  it('finds no raw Tailwind palette colors outside the exempt fixed-surface areas', () => {
    const report = offenders.map((o) => `  ${o.file}: ${o.matches.join(', ')}`).join('\n');
    expect(
      offenders.map((o) => o.file),
      offenders.length
        ? 'Raw palette colors found on themed surfaces — use the semantic tokens ' +
            '(danger / success / warning / info / spirit and the ink scale), or the ' +
            `alert classes in index.css:\n${report}`
        : ''
    ).toHaveLength(0);
  });

  // danger, accent and the other state colours are fills; as text they fall
  // under 4.5:1 in some themes (danger on a dark theme's paper is about 3.3:1).
  // Text takes the -ink variant, derived per theme to stay readable. No file
  // is exempt.
  it('colours text with the readable -ink variants, never a fill token', () => {
    const FILL_AS_TEXT = /\btext-(?:danger|success|warning|info|spirit|accent|brand)(?![-\w])/g;
    const found = Object.entries(SOURCES)
      .map(([path, source]) => ({ file: path, count: (source.match(FILL_AS_TEXT) ?? []).length }))
      .filter((entry) => entry.count > 0)
      .map((entry) => `${entry.file} (${entry.count})`);
    expect(found).toEqual([]);
  });

  // Tailwind generates only class names written out in full in the source, so
  // `text-${accent}` draws nothing for most values. No file is exempt.
  it('builds no colour class from a variable at runtime', () => {
    const BUILT = /\b(?:text|bg|border|ring|from|via|to)-\$\{/g;
    const found = Object.entries(SOURCES)
      .filter(([path]) => !path.includes('/__tests__/'))
      .map(([path, source]) => ({ file: path, count: (source.match(BUILT) ?? []).length }))
      .filter((entry) => entry.count > 0)
      .map((entry) => `${entry.file} (${entry.count})`);
    expect(found).toEqual([]);
  });

  it('keeps the exemption list small and intentional', () => {
    // A growing exemption list means the rule is being worked around rather
    // than followed; make that visible in review.
    expect(EXEMPT.length).toBeLessThanOrEqual(6);
  });
});
