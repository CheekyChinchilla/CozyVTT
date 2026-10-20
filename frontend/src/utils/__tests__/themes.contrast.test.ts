/**
 * Theme Contrast — the readability contract, enforced
 *
 * themes.ts promises WCAG AA (≥4.5:1) between text colors and the backgrounds
 * they render on. Before this test existed, all 16 preset themes broke that
 * promise somewhere — muted text sat at 3.3–4.4:1 in 13 of them, and accent
 * text bottomed out at 1.84:1 in Northern Frost.
 *
 * The pairs below are the ones the UI genuinely renders, with the class usage
 * counts that justify each entry. If a token stops being used as text, remove
 * its pair rather than lowering the bar.
 */

import { describe, it, expect } from 'vitest';
import { PRESET_THEMES, deriveReadableTokens, type ThemeColors } from '@/themes';
import { contrastRatioChannels, AA_TEXT, AA_LARGE } from '../color';

/** Backgrounds text is rendered on, by the token that provides them. */
const BACKGROUNDS = ['bgBase', 'bgSurface', 'paper'] as const;
type BackgroundToken = (typeof BACKGROUNDS)[number];

interface TextToken {
  /** Where the value comes from: an authored theme color or a derived token */
  resolve: (colors: ThemeColors, derived: Record<string, string>) => string;
  label: string;
  /** Which backgrounds this text actually appears on */
  on: BackgroundToken[];
  threshold: number;
}

const TEXT_TOKENS: TextToken[] = [
  // text-charcoal / text-ink — 92 uses
  { label: 'ink', on: [...BACKGROUNDS], threshold: AA_TEXT, resolve: (c) => c.ink },
  // text-warm-gray / text-ink-secondary — 321 uses
  { label: 'ink-secondary', on: [...BACKGROUNDS], threshold: AA_TEXT, resolve: (c) => c.inkSecondary },
  // text-stone-gray / text-ink-muted — 597 uses (the most common text color in the app)
  { label: 'ink-muted (derived)', on: [...BACKGROUNDS], threshold: AA_TEXT,
    resolve: (_c, d) => d['--rgb-ink-muted'] },
  // text-brand-ink — 471 uses (brand is also a fill in ~290 places, which keeps
  // the authored color; only the text variant is derived)
  { label: 'brand-ink (derived)', on: [...BACKGROUNDS], threshold: AA_TEXT,
    resolve: (_c, d) => d['--rgb-brand-ink'] },
  // text-warm-amber / text-accent — 74 uses, now routed through accent-ink
  { label: 'accent-ink (derived)', on: [...BACKGROUNDS], threshold: AA_TEXT,
    resolve: (_c, d) => d['--rgb-accent-ink'] },
  // text-spirit / text-spirit-purple — 98 uses
  { label: 'spirit-ink (derived)', on: [...BACKGROUNDS], threshold: AA_TEXT,
    resolve: (_c, d) => d['--rgb-spirit-ink'] },
  // text-spirit-red / text-danger and .alert-danger
  { label: 'danger-ink (derived)', on: [...BACKGROUNDS], threshold: AA_TEXT,
    resolve: (_c, d) => d['--rgb-danger-ink'] },
  // .alert-success / .badge-success
  { label: 'success-ink (derived)', on: [...BACKGROUNDS], threshold: AA_TEXT,
    resolve: (_c, d) => d['--rgb-success-ink'] },
  // .alert-warning / .badge-warning
  { label: 'warning-ink (derived)', on: [...BACKGROUNDS], threshold: AA_TEXT,
    resolve: (_c, d) => d['--rgb-warning-ink'] },
  // .alert-info
  { label: 'info-ink (derived)', on: [...BACKGROUNDS], threshold: AA_TEXT,
    resolve: (_c, d) => d['--rgb-info-ink'] },
];

describe('preset theme contrast', () => {
  it('ships the themes the picker expects', () => {
    expect(PRESET_THEMES.length).toBeGreaterThanOrEqual(16);
  });

  describe.each(PRESET_THEMES.map((t) => [t.name, t] as const))('%s', (_name, theme) => {
    const derived = deriveReadableTokens(theme.colors);

    it.each(
      TEXT_TOKENS.flatMap((token) =>
        token.on.map((bg) => [token.label, bg, token, bg] as const)
      )
    )('%s on %s meets AA', (_l, _b, token, bg) => {
      const fg = token.resolve(theme.colors, derived);
      const ratio = contrastRatioChannels(fg, theme.colors[bg]);
      expect(
        ratio,
        `${theme.name}: ${token.label} (${fg}) on ${bg} (${theme.colors[bg]}) = ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(token.threshold);
    });

    // Button labels sit on the accent fill, not on a page background
    it('accent button label meets AA against the accent fill', () => {
      const accentText = derived['--rgb-accent-text'];
      const ratio = contrastRatioChannels(accentText, theme.colors.accent);
      expect(
        ratio,
        `${theme.name}: accentText (${accentText}) on accent (${theme.colors.accent}) = ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(AA_TEXT);
    });

    // White on the brand fill fell to 2.7:1 in Obsidian Night, so a label on
    // brand is derived as the accent button's is: white where it reads.
    it('brand button label meets AA against the brand fill', () => {
      const label = derived['--rgb-brand-text'];
      const ratio = contrastRatioChannels(label, theme.colors.brand);
      expect(ratio, `${theme.name}: brand-text (${label}) on brand (${theme.colors.brand}) = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
    });

    // Brand buttons hover to brand-hover, the fill moved away from its label.
    it('brand button label meets AA on the hovered fill', () => {
      const label = derived['--rgb-brand-text'];
      const hovered = derived['--rgb-brand-hover'];
      const ratio = contrastRatioChannels(label, hovered);
      expect(ratio, `${theme.name}: brand-text (${label}) on brand-hover (${hovered}) = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(contrastRatioChannels(label, theme.colors.brand));
    });

    // The danger button was red-500 under white, 3.8:1 in every theme. Its
    // fill is the theme's danger colour, darkened until white reads on it.
    it('danger button fill takes a white label at AA', () => {
      const fill = derived['--rgb-danger-fill'];
      const ratio = contrastRatioChannels('255 255 255', fill);
      expect(ratio, `${theme.name}: white on danger-fill (${fill}) = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
    });
  });
});

/** `fill` laid over `background` at `alpha`, as `bg-danger/15` draws it. */
function over(fill: string, background: string, alpha: number): string {
  const f = fill.split(/\s+/).map(Number);
  const b = background.split(/\s+/).map(Number);
  return f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha))).join(' ');
}

// Text sits on tints too: a chip or panel is its colour at 10 to 15% with the
// -ink text on it (the alert and badge classes, and the sheets), and an inset
// panel or a hovered row is a wash of the ink at 5 to 10%. Text derived only
// against plain paper fell to about 3.5:1 there in the dark themes.
describe('text on tints', () => {
  const STATES = [
    ['danger-ink', (c: ThemeColors) => c.danger],
    ['spirit-ink', (c: ThemeColors) => c.spirit],
    ['accent-ink', (c: ThemeColors) => c.accent],
    ['brand-ink', (c: ThemeColors) => c.brand],
    ['success-ink', (_c: ThemeColors, d: Record<string, string>) => d['--rgb-success']],
    ['warning-ink', (_c: ThemeColors, d: Record<string, string>) => d['--rgb-warning']],
    ['info-ink', (_c: ThemeColors, d: Record<string, string>) => d['--rgb-info']],
    ['token-friendly-ink', (_c: ThemeColors, d: Record<string, string>) => d['--rgb-token-friendly']],
    ['token-hostile-ink', (_c: ThemeColors, d: Record<string, string>) => d['--rgb-token-hostile']],
    ['token-neutral-ink', (_c: ThemeColors, d: Record<string, string>) => d['--rgb-token-neutral']],
    ['token-player-ink', (_c: ThemeColors, d: Record<string, string>) => d['--rgb-token-player']],
  ] as const;

  describe.each(PRESET_THEMES.map((t) => [t.name, t] as const))('%s', (_name, theme) => {
    const derived = deriveReadableTokens(theme.colors);

    // 15% for a chip or panel; 30% for the hovers that deepen one (bg-x/25
    // and bg-x/30), where the text fell to 3.4 to 4.2:1.
    it.each(STATES.flatMap(([token, fill]) => BACKGROUNDS.flatMap((bg) => [15, 30].map((pct) => [token, pct, bg, fill] as const))))(
      '%s on its %i%% tint over %s meets AA',
      (token, pct, bg, fill) => {
        const back = over(fill(theme.colors, derived), theme.colors[bg], pct / 100);
        const ratio = contrastRatioChannels(derived[`--rgb-${token}`], back);
        expect(ratio, `${theme.name}: ${token} on ${back} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    );

    it.each([
      ['ink-muted', derived['--rgb-ink-muted']],
      ['ink-secondary', derived['--rgb-ink-secondary'] ?? theme.colors.inkSecondary],
    ] as const)('%s on a 10%% ink wash over paper and surface meets AA', (token, fg) => {
      for (const bg of ['paper', 'bgSurface'] as const) {
        const back = over(theme.colors.ink, theme.colors[bg], 0.1);
        const ratio = contrastRatioChannels(fg, back);
        expect(ratio, `${theme.name}: ${token} on ${back} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });
  });
});

describe('derived tokens never weaken an authored color', () => {
  it.each(PRESET_THEMES.map((t) => [t.name, t] as const))('%s', (_name, theme) => {
    const derived = deriveReadableTokens(theme.colors);
    // inkMuted is clamped, so it may change — but only ever to improve contrast
    const before = contrastRatioChannels(theme.colors.inkMuted, theme.colors.bgBase);
    const after = contrastRatioChannels(derived['--rgb-ink-muted'], theme.colors.bgBase);
    expect(after).toBeGreaterThanOrEqual(Math.min(before, AA_LARGE));
  });
});
