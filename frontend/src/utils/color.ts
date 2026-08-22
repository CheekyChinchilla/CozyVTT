// ============================================
// Color / Contrast Utilities
//
// One implementation of WCAG contrast, shared by everything that needs it:
//   - themes.ts        derives readable text variants when a theme is applied
//   - themes.ts        builds custom themes from an admin's chosen colors
//   - ThemePicker      warns when a custom pairing is unreadable
//   - themes.contrast  test that fails the build if a preset theme regresses
//
// Colors use the same "R G B" channel string the theme variables do
// (e.g. "74 93 78"), so values move between CSS, themes.ts and here unchanged.
// ============================================

export type Rgb = [number, number, number];

/** WCAG AA minimum for body text. */
export const AA_TEXT = 4.5;
/** WCAG AA minimum for large text and non-text UI (borders, icons). */
export const AA_LARGE = 3;

/** Parse a `"74 93 78"` channel string. Tolerates extra whitespace. */
export function parseRgb(channels: string): Rgb {
  const parts = channels.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    // Fall back to mid-grey rather than throwing — a malformed custom color
    // should never take the whole app down
    return [128, 128, 128];
  }
  return [clampChannel(parts[0]), clampChannel(parts[1]), clampChannel(parts[2])];
}

/** Format an Rgb tuple back into the `"74 93 78"` channel string. */
export function toChannels(rgb: Rgb): string {
  return rgb.map((c) => Math.round(clampChannel(c))).join(' ');
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, value));
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Convenience wrapper for the channel-string form used by themes. */
export function contrastRatioChannels(a: string, b: string): number {
  return contrastRatio(parseRgb(a), parseRgb(b));
}

/**
 * Adjust `foreground` until it reaches `target` contrast against `background`,
 * keeping its hue.
 *
 * Moves away from the background's lightness — darkening a color on a light
 * background, lightening it on a dark one — so an accent stays recognisably
 * itself while becoming readable as text. Returns the input unchanged when it
 * already passes, so authored colors that are fine are never touched.
 */
export function ensureReadable(
  foreground: Rgb,
  background: Rgb,
  target: number = AA_TEXT
): Rgb {
  if (contrastRatio(foreground, background) >= target) {
    return foreground;
  }

  // Darken against a light background, lighten against a dark one
  const towardsBlack = relativeLuminance(background) > 0.18;
  const [h, s] = rgbToHsl(foreground);
  const startL = rgbToHsl(foreground)[2];

  // Walk lightness in 1% steps; 100 steps covers the full range either way
  let best = foreground;
  let bestRatio = contrastRatio(foreground, background);

  for (let step = 1; step <= 100; step++) {
    const l = towardsBlack ? startL - step / 100 : startL + step / 100;
    if (l < 0 || l > 1) break;

    const candidate = hslToRgb(h, s, l);
    const ratio = contrastRatio(candidate, background);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
    if (ratio >= target) return candidate;
  }

  // Hue-preserving adjustment could not reach the target (very light
  // background with a pale color, or vice versa) — return the closest we got,
  // which is still a large improvement over the original
  return best;
}

/** Channel-string form of {@link ensureReadable}. */
export function ensureReadableChannels(
  foreground: string,
  background: string,
  target: number = AA_TEXT
): string {
  return toChannels(ensureReadable(parseRgb(foreground), parseRgb(background), target));
}

/**
 * Pick a label color for text sitting on a filled `background`.
 *
 * Prefers a hue-preserving shade of the fill itself (a deep amber label on an
 * amber button), and falls back to black or white when the hue cannot reach the
 * target — which is what happens with mid-luminance fills.
 */
export function readableTextOn(background: string, target: number = AA_TEXT): string {
  const bg = parseRgb(background);
  const tinted = ensureReadable(bg, bg, target);
  if (contrastRatio(tinted, bg) >= target) return toChannels(tinted);

  const white: Rgb = [255, 255, 255];
  const black: Rgb = [0, 0, 0];
  return toChannels(contrastRatio(white, bg) >= contrastRatio(black, bg) ? white : black);
}

/**
 * Make `foreground` readable against whichever of the given backgrounds is
 * hardest. Used where one token is rendered on several surfaces — muted text
 * appears on both the page background and on paper, for instance.
 */
export function ensureReadableOnAll(
  foreground: string,
  backgrounds: string[],
  target: number = AA_TEXT
): string {
  return backgrounds.reduce(
    (current, background) => ensureReadableChannels(current, background, target),
    foreground
  );
}

// ── HSL conversion (internal) ───────────────────────────────────────────────

function rgbToHsl(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l]; // achromatic

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6; break;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}
