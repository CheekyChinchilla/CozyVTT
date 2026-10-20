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
import indexCss from '../../index.css?raw';

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
 * Palette families that have a semantic token to use instead. The token
 * colours of the map (dispositions, HP) are the token-* tokens, from
 * utils/tokenColours.ts.
 */
const RAW_COLOR =
  /\b(?:text|bg|border(?:-[trblxyse])?|ring|divide|placeholder|from|via|to|fill|stroke|outline|decoration|accent)-(?:red|rose|pink|fuchsia|green|emerald|lime|teal|amber|yellow|orange|blue|indigo|sky|cyan|purple|violet|stone|gray|slate|zinc|neutral|sepia)-\d{2,3}\b/g;

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
    // The legacy names are the same fills: warm-amber and sunset-orange the
    // accent, spirit-purple the spirit, spirit-red the danger, moss-green the
    // brand.
    const FILL_AS_TEXT =
      /\btext-(?:danger|success|warning|info|spirit|accent|brand|warm-amber|sunset-orange|spirit-purple|spirit-red|moss-green)(?![-\w])/g;
    const found = Object.entries(SOURCES)
      .map(([path, source]) => ({ file: path, count: (source.match(FILL_AS_TEXT) ?? []).length }))
      .filter((entry) => entry.count > 0)
      .map((entry) => `${entry.file} (${entry.count})`);
    expect(found).toEqual([]);
  });

  // A label on a solid brand or danger fill: white fell under 4.5:1 on the
  // brand in four themes, and on danger in four dark ones. The brand takes
  // the derived brand-text label, and a white label the danger-fill.
  it('labels a solid brand, danger or state fill with a label that reads on it', () => {
    // Plain strings, and lines: a template literal's branches each hold a
    // fill and its own label, so the template as a whole is not one class list.
    const STRING = /"([^"]*)"|'([^'\n]*)'/g;
    // The variant prefixes (`hover:` and the rest) a class is used under.
    const prefixes = (classes: string, re: RegExp) =>
      new Set(classes.split(/\s+/).flatMap((c) => { const m = re.exec(c); return m ? [m[1]] : []; }));
    const BRAND_FILL = /^((?:[\w-]+:)*)bg-(?:brand|moss-green)$/;
    const DANGER_FILL = /^((?:[\w-]+:)*)bg-(?:danger|spirit-red)$/;
    // White fails on the spirit, success, warning and info fills in most
    // themes; they take the soft tint and -ink text instead, as in the sheets.
    const STATE_FILL = /^((?:[\w-]+:)*)bg-(?:success|warning|info|spirit|spirit-purple)$/;
    // The accent (warm-amber) takes accent-text, as btn-primary does.
    const ACCENT_FILL = /^((?:[\w-]+:)*)bg-(?:accent|warm-amber)$/;
    const WHITE = /^((?:[\w-]+:)*)text-(?:white|paper-white|canvas)$/;
    const found: string[] = [];
    for (const [path, source] of Object.entries(SOURCES)) {
      // Each quoted string, and each line too: an apostrophe in a comment or
      // in text can pair the quotes wrongly.
      const pieces = [...[...source.matchAll(STRING)].map((m) => m[1] ?? m[2] ?? ''), ...source.split('\n')];
      for (const piece of pieces) {
        const classes = piece.replace(/['"`{}]/g, ' ');
        const white = prefixes(classes, WHITE);
        const fills = [...prefixes(classes, BRAND_FILL), ...prefixes(classes, DANGER_FILL), ...prefixes(classes, STATE_FILL), ...prefixes(classes, ACCENT_FILL)];
        if (fills.some((p) => white.has(p))) found.push(`${path}: ${classes.trim().slice(0, 80)}`);
      }
    }
    expect([...new Set(found)]).toEqual([]);
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

// The button utilities are CSS, which the scan above does not read. The
// danger button was red-500 under white (3.8:1 in every theme), and the
// secondary button wrote its label in the brand fill (2.6:1 in Shadow Realm).
describe('the button utilities in index.css', () => {
  const utility = (name: string) =>
    new RegExp(`@utility ${name} \\{([\\s\\S]*?)\\n\\}`).exec(indexCss)?.[1] ?? '';

  it('fill the danger button from the theme, with a label that reads on it', () => {
    const danger = utility('btn-danger');
    expect(danger).toMatch(/\bbg-danger-fill\b/);
    expect(danger).not.toMatch(/\b(?:bg|ring)-red-\d/);
  });

  it('write the secondary button in readable brand text, and its hover label on brand', () => {
    const secondary = utility('btn-secondary');
    expect(secondary).toMatch(/\btext-brand-ink\b/);
    expect(secondary).not.toMatch(/\btext-brand(?![-\w])/);
    expect(secondary).toMatch(/\bhover:text-brand-text\b/);
  });
});

// The map draws a token's disposition and HP in fixed colours, and the panels
// that pick a disposition show the same ones. Each hex was written out where
// it was used (the map held the friendly teal twice); now only
// tokenColours.ts holds them.
describe('the token colours', () => {
  it('are written down once, in utils/tokenColours.ts', () => {
    // The hexes no other drawing uses (red, green and amber also colour
    // walls and the ruler).
    const HEXES = /#(?:2dd4bf|fbbf24|3b82f6|84cc16|78716c)\b/gi;
    const found = Object.entries(SOURCES)
      .filter(([path]) => path !== '/src/utils/tokenColours.ts')
      .flatMap(([path, source]) => (source.match(HEXES) ?? []).map((hex) => `${path}: ${hex}`));
    expect(found).toEqual([]);
  });
});
