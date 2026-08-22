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
    resolve: (_c, d) => d['--color-ink-muted'] },
  // text-brand-ink — 471 uses (brand is also a fill in ~290 places, which keeps
  // the authored color; only the text variant is derived)
  { label: 'brand-ink (derived)', on: [...BACKGROUNDS], threshold: AA_TEXT,
    resolve: (_c, d) => d['--color-brand-ink'] },
  // text-warm-amber / text-accent — 74 uses, now routed through accent-ink
  { label: 'accent-ink (derived)', on: [...BACKGROUNDS], threshold: AA_TEXT,
    resolve: (_c, d) => d['--color-accent-ink'] },
  // text-spirit / text-spirit-purple — 98 uses
  { label: 'spirit-ink (derived)', on: [...BACKGROUNDS], threshold: AA_TEXT,
    resolve: (_c, d) => d['--color-spirit-ink'] },
  // text-spirit-red / text-danger and .alert-danger
  { label: 'danger-ink (derived)', on: [...BACKGROUNDS], threshold: AA_TEXT,
    resolve: (_c, d) => d['--color-danger-ink'] },
  // .alert-success / .badge-success
  { label: 'success-ink (derived)', on: [...BACKGROUNDS], threshold: AA_TEXT,
    resolve: (_c, d) => d['--color-success-ink'] },
  // .alert-warning / .badge-warning
  { label: 'warning-ink (derived)', on: [...BACKGROUNDS], threshold: AA_TEXT,
    resolve: (_c, d) => d['--color-warning-ink'] },
  // .alert-info
  { label: 'info-ink (derived)', on: [...BACKGROUNDS], threshold: AA_TEXT,
    resolve: (_c, d) => d['--color-info-ink'] },
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
      const accentText = derived['--color-accent-text'];
      const ratio = contrastRatioChannels(accentText, theme.colors.accent);
      expect(
        ratio,
        `${theme.name}: accentText (${accentText}) on accent (${theme.colors.accent}) = ${ratio.toFixed(2)}:1`
      ).toBeGreaterThanOrEqual(AA_TEXT);
    });
  });
});

describe('derived tokens never weaken an authored color', () => {
  it.each(PRESET_THEMES.map((t) => [t.name, t] as const))('%s', (_name, theme) => {
    const derived = deriveReadableTokens(theme.colors);
    // inkMuted is clamped, so it may change — but only ever to improve contrast
    const before = contrastRatioChannels(theme.colors.inkMuted, theme.colors.bgBase);
    const after = contrastRatioChannels(derived['--color-ink-muted'], theme.colors.bgBase);
    expect(after).toBeGreaterThanOrEqual(Math.min(before, AA_LARGE));
  });
});
