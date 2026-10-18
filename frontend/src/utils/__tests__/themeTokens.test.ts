/**
 * Theme Token Guard
 *
 * Raw Tailwind palette colors (bg-red-50, text-stone-500, …) do not follow the
 * theme: an error box built from them stays pale pink on a dark theme, and grey
 * text keeps its light-mode shade on a dark panel. Every themed surface must use
 * the semantic tokens instead — see the alert and badge classes in index.css,
 * and the token list in its @theme block.
 *
 * Two areas are exempt, listed explicitly so the exemption stays visible and
 * reviewable: the DM map overlays, a fixed-surface design, and the character
 * sheets until they are on the theme tokens.
 */

import { describe, it, expect } from 'vitest';

/**
 * Exempt:
 *  - the character sheets, for now: they still use raw palette colors (see the
 *    TODO below)
 *  - the DM map overlays, deliberately dark panels floating over the map
 */
const EXEMPT = [
  // TODO(sheets): GAME_SYSTEMS.md's Styling rule has the sheets use the theme
  // tokens like the rest of the app, and they do not yet: they are half themed.
  // In a dark theme the D&D 5e saving throw names take the theme's light text
  // on the sheet's white paper, and the Call of Cthulhu sheet turns dark around
  // its dark sepia text. Right: theme tokens throughout every sheet, the Call
  // of Cthulhu sheet's sepia included, then this entry goes.
  '/src/components/character-sheets/',
  '/src/components/campaign/DmWallControls.tsx',
  '/src/components/campaign/DmLightControls.tsx',
  '/src/components/campaign/DmFogControls.tsx',
  '/src/components/campaign/DmToolPanelContainer.tsx',
];

/** Palette families that have a semantic token to use instead. */
const RAW_COLOR =
  /\b(?:text|bg|border|ring|divide|placeholder|from|via|to)-(?:red|rose|green|emerald|amber|yellow|orange|blue|indigo|sky|purple|violet|stone|gray|slate|zinc|neutral)-\d{2,3}\b/g;

// Vite inlines every component's source at build time, so the check needs no
// filesystem access and runs in the same environment as the rest of the suite.
const SOURCES = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('themed surfaces use semantic tokens', () => {
  const offenders = Object.entries(SOURCES)
    .filter(([path]) => !EXEMPT.some((exempt) => path.startsWith(exempt) || path === exempt))
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

  it('keeps the exemption list small and intentional', () => {
    // A growing exemption list means the rule is being worked around rather
    // than followed; make that visible in review.
    expect(EXEMPT.length).toBeLessThanOrEqual(6);
  });
});
