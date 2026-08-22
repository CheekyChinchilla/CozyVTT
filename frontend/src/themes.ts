/**
 * CozyVTT Theme Definitions
 *
 * Each theme defines RGB channel triplets (e.g. "74 93 78") for every CSS
 * variable consumed by Tailwind. Tailwind composes them with alpha via
 * rgb(var(--color-x) / <alpha-value>).
 *
 * Readability contract: every theme meets WCAG AA contrast (≥4.5:1) between
 * text colors and the backgrounds they are rendered on. This is enforced, not
 * assumed — see utils/__tests__/themes.contrast.test.ts, which fails the build
 * on any violation.
 *
 * Colors that exist to be *fills* (accent, spirit, danger, and the state hues)
 * get a derived `-ink` variant for use as text; see deriveReadableTokens.
 * Authored values that already pass are never modified.
 */

import { ensureReadableChannels, ensureReadableOnAll, readableTextOn } from './utils/color';

export interface ThemeColors {
  brand: string;
  brandDark: string;
  accent: string;
  accentHover: string;
  accentText: string;
  bgBase: string;
  bgSurface: string;
  bgSurfaceLight: string;
  bgSurfaceDark: string;
  ink: string;
  inkSecondary: string;
  inkMuted: string;
  paper: string;
  danger: string;
  spirit: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  colors: ThemeColors;
  category: 'warm' | 'cool' | 'dark' | 'neutral' | 'vibrant';
}

export interface FontOption {
  id: string;
  name: string;
  heading: string;
  body: string;
  mono: string;
  googleImport: string;
}

// ────────────────────────────────────────────────────
// Preset Themes
// ────────────────────────────────────────────────────

export const PRESET_THEMES: ThemeDefinition[] = [
  // ── WARM ──
  {
    id: 'cozy-default',
    name: 'Cozy Default',
    description: 'The original warm, earthy CozyVTT palette',
    category: 'warm',
    colors: {
      brand: '74 93 78',
      brandDark: '44 62 47',
      accent: '212 165 116',
      accentHover: '232 158 91',
      accentText: '44 62 47',
      bgBase: '255 249 230',
      bgSurface: '244 236 216',
      bgSurfaceLight: '251 247 238',
      bgSurfaceDark: '224 212 184',
      ink: '31 41 55',
      inkSecondary: '107 96 90',
      inkMuted: '107 114 128',
      paper: '254 254 254',
      danger: '192 57 43',
      spirit: '147 112 219',
    },
  },
  {
    id: 'autumn-hearth',
    name: 'Autumn Hearth',
    description: 'Warm oranges and deep browns, like a fireside tavern',
    category: 'warm',
    colors: {
      brand: '139 90 43',
      brandDark: '87 55 24',
      accent: '210 105 30',
      accentHover: '230 120 40',
      accentText: '45 25 10',
      bgBase: '255 248 240',
      bgSurface: '248 237 222',
      bgSurfaceLight: '252 245 236',
      bgSurfaceDark: '235 218 195',
      ink: '45 30 15',
      inkSecondary: '120 90 65',
      inkMuted: '140 115 90',
      paper: '255 253 250',
      danger: '180 45 30',
      spirit: '160 100 180',
    },
  },
  {
    id: 'desert-sand',
    name: 'Desert Sand',
    description: 'Sandy golds and terracotta for arid adventures',
    category: 'warm',
    colors: {
      brand: '163 110 60',
      brandDark: '110 70 35',
      accent: '205 150 75',
      accentHover: '220 165 85',
      accentText: '55 35 15',
      bgBase: '252 245 232',
      bgSurface: '243 233 215',
      bgSurfaceLight: '249 242 228',
      bgSurfaceDark: '230 216 192',
      ink: '50 35 20',
      inkSecondary: '115 90 65',
      inkMuted: '145 125 100',
      paper: '255 252 247',
      danger: '185 55 35',
      spirit: '140 120 190',
    },
  },
  {
    id: 'rose-garden',
    name: 'Rose Garden',
    description: 'Soft pinks and muted rose tones for a romantic feel',
    category: 'warm',
    colors: {
      brand: '155 75 95',
      brandDark: '110 45 65',
      accent: '210 140 155',
      accentHover: '225 155 170',
      accentText: '55 20 35',
      bgBase: '255 245 248',
      bgSurface: '248 234 238',
      bgSurfaceLight: '252 242 245',
      bgSurfaceDark: '238 218 224',
      ink: '50 25 35',
      inkSecondary: '120 85 95',
      inkMuted: '150 115 125',
      paper: '255 252 253',
      danger: '190 50 50',
      spirit: '150 100 200',
    },
  },

  // ── COOL ──
  {
    id: 'ocean-depths',
    name: 'Ocean Depths',
    description: 'Deep blues and teals for seafaring campaigns',
    category: 'cool',
    colors: {
      brand: '45 100 130',
      brandDark: '25 65 90',
      accent: '100 180 200',
      accentHover: '120 200 220',
      accentText: '10 40 55',
      bgBase: '238 248 255',
      bgSurface: '225 240 250',
      bgSurfaceLight: '235 246 253',
      bgSurfaceDark: '205 225 240',
      ink: '15 30 50',
      inkSecondary: '65 90 115',
      inkMuted: '90 115 140',
      paper: '250 253 255',
      danger: '200 55 45',
      spirit: '100 140 220',
    },
  },
  {
    id: 'northern-frost',
    name: 'Northern Frost',
    description: 'Icy blues and silver for frozen tundra settings',
    category: 'cool',
    colors: {
      brand: '70 110 145',
      brandDark: '40 70 100',
      accent: '150 190 215',
      accentHover: '170 205 225',
      accentText: '20 40 60',
      bgBase: '242 248 252',
      bgSurface: '232 240 248',
      bgSurfaceLight: '240 246 251',
      bgSurfaceDark: '215 228 240',
      ink: '20 35 55',
      inkSecondary: '75 100 125',
      inkMuted: '105 125 150',
      paper: '252 254 255',
      danger: '195 55 50',
      spirit: '120 130 210',
    },
  },
  {
    id: 'enchanted-forest',
    name: 'Enchanted Forest',
    description: 'Deep greens and moss for woodland adventures',
    category: 'cool',
    colors: {
      brand: '50 105 70',
      brandDark: '28 65 42',
      accent: '130 190 110',
      accentHover: '150 210 125',
      accentText: '15 45 25',
      bgBase: '242 252 244',
      bgSurface: '230 245 233',
      bgSurfaceLight: '238 250 240',
      bgSurfaceDark: '210 232 215',
      ink: '18 40 25',
      inkSecondary: '65 100 75',
      inkMuted: '95 125 100',
      paper: '250 255 251',
      danger: '190 50 40',
      spirit: '130 110 200',
    },
  },
  {
    id: 'twilight-vale',
    name: 'Twilight Vale',
    description: 'Purples and lavender for mystical, fey-touched realms',
    category: 'cool',
    colors: {
      brand: '100 75 140',
      brandDark: '65 45 100',
      accent: '170 140 200',
      accentHover: '190 155 215',
      accentText: '30 18 50',
      bgBase: '248 244 255',
      bgSurface: '240 234 250',
      bgSurfaceLight: '246 242 253',
      bgSurfaceDark: '225 218 240',
      ink: '30 20 50',
      inkSecondary: '90 75 115',
      inkMuted: '120 105 145',
      paper: '253 251 255',
      danger: '195 50 45',
      spirit: '140 100 220',
    },
  },

  // ── DARK ──
  {
    id: 'obsidian-night',
    name: 'Obsidian Night',
    description: 'Dark mode with warm amber accents',
    category: 'dark',
    colors: {
      brand: '180 155 100',
      brandDark: '210 180 120',
      accent: '212 165 116',
      accentHover: '232 180 130',
      accentText: '30 20 10',
      bgBase: '24 24 28',
      bgSurface: '32 32 38',
      bgSurfaceLight: '40 40 48',
      bgSurfaceDark: '18 18 22',
      ink: '230 225 215',
      inkSecondary: '170 160 145',
      inkMuted: '130 125 115',
      paper: '45 45 52',
      danger: '220 75 65',
      spirit: '160 130 230',
    },
  },
  {
    id: 'shadow-realm',
    name: 'Shadow Realm',
    description: 'Deep dark with crimson highlights for horror campaigns',
    category: 'dark',
    colors: {
      brand: '170 70 70',
      brandDark: '200 90 90',
      accent: '190 80 80',
      accentHover: '210 100 95',
      accentText: '255 230 230',
      bgBase: '20 18 22',
      bgSurface: '30 27 33',
      bgSurfaceLight: '38 35 42',
      bgSurfaceDark: '15 13 17',
      ink: '225 215 220',
      inkSecondary: '165 150 158',
      inkMuted: '125 115 120',
      paper: '42 38 45',
      danger: '220 65 55',
      spirit: '150 90 200',
    },
  },
  {
    id: 'deep-dungeon',
    name: 'Deep Dungeon',
    description: 'Dark stone grey with emerald green accents',
    category: 'dark',
    colors: {
      brand: '80 170 120',
      brandDark: '100 200 145',
      accent: '90 185 130',
      accentHover: '110 205 150',
      accentText: '10 35 20',
      bgBase: '22 25 28',
      bgSurface: '30 34 38',
      bgSurfaceLight: '38 42 48',
      bgSurfaceDark: '16 18 22',
      ink: '220 228 225',
      inkSecondary: '155 168 162',
      inkMuted: '115 128 122',
      paper: '40 45 50',
      danger: '215 70 60',
      spirit: '120 140 220',
    },
  },
  {
    id: 'midnight-court',
    name: 'Midnight Court',
    description: 'Royal dark blue with gold accents for noble intrigue',
    category: 'dark',
    colors: {
      brand: '160 145 90',
      brandDark: '195 175 110',
      accent: '185 165 95',
      accentHover: '205 185 110',
      accentText: '25 20 5',
      bgBase: '18 22 35',
      bgSurface: '25 30 48',
      bgSurfaceLight: '32 38 58',
      bgSurfaceDark: '12 15 25',
      ink: '220 225 235',
      inkSecondary: '155 162 180',
      inkMuted: '115 122 145',
      paper: '35 42 62',
      danger: '220 70 60',
      spirit: '140 120 220',
    },
  },

  // ── NEUTRAL ──
  {
    id: 'parchment-classic',
    name: 'Parchment Classic',
    description: 'Clean, traditional paper-and-ink aesthetic',
    category: 'neutral',
    colors: {
      brand: '85 85 85',
      brandDark: '50 50 50',
      accent: '160 130 90',
      accentHover: '180 148 105',
      accentText: '40 30 15',
      bgBase: '250 247 240',
      bgSurface: '242 238 228',
      bgSurfaceLight: '248 245 237',
      bgSurfaceDark: '228 222 210',
      ink: '35 35 35',
      inkSecondary: '100 95 88',
      inkMuted: '130 125 118',
      paper: '255 253 248',
      danger: '185 55 40',
      spirit: '130 110 180',
    },
  },
  {
    id: 'slate-modern',
    name: 'Slate Modern',
    description: 'Clean modern greys with blue-grey accent',
    category: 'neutral',
    colors: {
      brand: '70 85 105',
      brandDark: '40 55 75',
      accent: '120 150 180',
      accentHover: '140 170 200',
      accentText: '15 25 40',
      bgBase: '245 247 250',
      bgSurface: '235 238 242',
      bgSurfaceLight: '242 244 248',
      bgSurfaceDark: '220 225 232',
      ink: '25 30 40',
      inkSecondary: '80 90 105',
      inkMuted: '115 125 140',
      paper: '252 253 255',
      danger: '195 55 45',
      spirit: '110 120 200',
    },
  },

  // ── VIBRANT ──
  {
    id: 'dragonfire',
    name: 'Dragonfire',
    description: 'Bold reds and charcoal for high-energy combat',
    category: 'vibrant',
    colors: {
      brand: '170 55 50',
      brandDark: '120 35 30',
      accent: '230 140 50',
      accentHover: '245 160 65',
      accentText: '50 25 5',
      bgBase: '255 247 242',
      bgSurface: '250 238 230',
      bgSurfaceLight: '253 244 238',
      bgSurfaceDark: '240 225 215',
      ink: '40 25 22',
      inkSecondary: '115 85 78',
      inkMuted: '145 115 108',
      paper: '255 252 250',
      danger: '200 45 35',
      spirit: '150 100 190',
    },
  },
  {
    id: 'arcane-storm',
    name: 'Arcane Storm',
    description: 'Electric blues and violet for high-magic settings',
    category: 'vibrant',
    colors: {
      brand: '60 80 175',
      brandDark: '35 50 130',
      accent: '140 110 220',
      accentHover: '160 130 240',
      accentText: '15 10 45',
      bgBase: '242 244 255',
      bgSurface: '232 235 252',
      bgSurfaceLight: '240 242 254',
      bgSurfaceDark: '218 222 245',
      ink: '20 22 50',
      inkSecondary: '75 80 125',
      inkMuted: '105 110 150',
      paper: '250 251 255',
      danger: '200 55 50',
      spirit: '140 100 230',
    },
  },
];

// ────────────────────────────────────────────────────
// Font Options (all open-source / Google Fonts)
// ────────────────────────────────────────────────────

export const FONT_OPTIONS: FontOption[] = [
  {
    id: 'default',
    name: 'Default (Quicksand + Inter)',
    heading: "'Quicksand', 'Comfortaa', sans-serif",
    body: "'Inter', 'Open Sans', sans-serif",
    mono: "'JetBrains Mono', monospace",
    googleImport: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
  },
  {
    id: 'medieval',
    name: 'Medieval (MedievalSharp + Merriweather)',
    heading: "'MedievalSharp', cursive",
    body: "'Merriweather', serif",
    mono: "'JetBrains Mono', monospace",
    googleImport: 'https://fonts.googleapis.com/css2?family=MedievalSharp&family=Merriweather:wght@300;400;700&family=JetBrains+Mono:wght@400;500&display=swap',
  },
  {
    id: 'elegant',
    name: 'Elegant (Playfair Display + Lora)',
    heading: "'Playfair Display', serif",
    body: "'Lora', serif",
    mono: "'JetBrains Mono', monospace",
    googleImport: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Lora:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
  },
  {
    id: 'modern',
    name: 'Modern (Poppins + Nunito)',
    heading: "'Poppins', sans-serif",
    body: "'Nunito', sans-serif",
    mono: "'Fira Code', monospace",
    googleImport: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Nunito:wght@300;400;600&family=Fira+Code:wght@400;500&display=swap',
  },
  {
    id: 'handwritten',
    name: 'Handwritten (Caveat + Patrick Hand)',
    heading: "'Caveat', cursive",
    body: "'Patrick Hand', cursive",
    mono: "'JetBrains Mono', monospace",
    googleImport: 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&family=Patrick+Hand&family=JetBrains+Mono:wght@400;500&display=swap',
  },
  {
    id: 'clean',
    name: 'Clean (Raleway + Source Sans 3)',
    heading: "'Raleway', sans-serif",
    body: "'Source Sans 3', sans-serif",
    mono: "'Source Code Pro', monospace",
    googleImport: 'https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&family=Source+Sans+3:wght@300;400;600&family=Source+Code+Pro:wght@400;500&display=swap',
  },
  {
    id: 'scholarly',
    name: 'Scholarly (Cinzel + EB Garamond)',
    heading: "'Cinzel', serif",
    body: "'EB Garamond', serif",
    mono: "'JetBrains Mono', monospace",
    googleImport: 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=EB+Garamond:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
  },
  {
    id: 'gothic',
    name: 'Gothic (UnifrakturMaguntia + Crimson Text)',
    heading: "'UnifrakturMaguntia', cursive",
    body: "'Crimson Text', serif",
    mono: "'JetBrains Mono', monospace",
    googleImport: 'https://fonts.googleapis.com/css2?family=UnifrakturMaguntia&family=Crimson+Text:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
  },
];

// ────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────

export function getThemeById(id: string): ThemeDefinition | undefined {
  return PRESET_THEMES.find(t => t.id === id);
}

export function getFontById(id: string): FontOption | undefined {
  return FONT_OPTIONS.find(f => f.id === id);
}

export function hexToRgbChannels(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export function rgbChannelsToHex(channels: string): string {
  const [r, g, b] = channels.split(' ').map(Number);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Canonical hues for states the palettes don't define. Each is adapted per
 * theme (see deriveReadableTokens) so a dark theme gets a lighter green rather
 * than one that disappears into the background.
 */
export const STATE_HUES = {
  success: '34 139 68',
  warning: '191 129 20',
  info: '37 99 190',
} as const;

/**
 * Tokens computed from a theme rather than authored in it.
 *
 * Two kinds live here:
 *   - `-ink` variants: readable text versions of colors that exist to be
 *     *fills* (accent, spirit, danger, and the state hues). The fill keeps its
 *     designed color; only text uses the ink.
 *   - a clamped `inkMuted`: authored values that already pass are returned
 *     unchanged, so this only moves the themes whose muted text is genuinely
 *     too faint.
 */
export function deriveReadableTokens(colors: ThemeColors): Record<string, string> {
  const onPage = [colors.bgBase, colors.bgSurface];
  const onPaper = [colors.paper];
  const everywhere = [...onPage, ...onPaper];

  return {
    '--color-ink-muted': ensureReadableOnAll(colors.inkMuted, everywhere),
    // Label on an accent-filled button. Authored values that already contrast
    // are kept; the rest are nudged until the label is legible.
    '--color-accent-text': ensureReadableChannels(colors.accentText, colors.accent),
    // brand is a fill in ~290 places (buttons, borders) AND text in ~470.
    // The fill keeps the authored color; text uses this readable shade of it.
    '--color-brand-ink': ensureReadableOnAll(colors.brand, everywhere),
    '--color-accent-ink': ensureReadableOnAll(colors.accent, everywhere),
    '--color-spirit-ink': ensureReadableOnAll(colors.spirit, everywhere),
    '--color-danger-ink': ensureReadableOnAll(colors.danger, everywhere),
    '--color-success': STATE_HUES.success,
    '--color-success-ink': ensureReadableOnAll(STATE_HUES.success, everywhere),
    '--color-warning': STATE_HUES.warning,
    '--color-warning-ink': ensureReadableOnAll(STATE_HUES.warning, everywhere),
    '--color-info': STATE_HUES.info,
    '--color-info-ink': ensureReadableOnAll(STATE_HUES.info, everywhere),
  };
}

export function applyThemeColors(colors: ThemeColors): void {
  const root = document.documentElement;
  root.style.setProperty('--color-brand', colors.brand);
  root.style.setProperty('--color-brand-dark', colors.brandDark);
  root.style.setProperty('--color-accent', colors.accent);
  root.style.setProperty('--color-accent-hover', colors.accentHover);
  root.style.setProperty('--color-accent-text', colors.accentText);
  root.style.setProperty('--color-bg-base', colors.bgBase);
  root.style.setProperty('--color-bg-surface', colors.bgSurface);
  root.style.setProperty('--color-bg-surface-light', colors.bgSurfaceLight);
  root.style.setProperty('--color-bg-surface-dark', colors.bgSurfaceDark);
  root.style.setProperty('--color-ink', colors.ink);
  root.style.setProperty('--color-ink-secondary', colors.inkSecondary);
  root.style.setProperty('--color-ink-muted', colors.inkMuted);
  root.style.setProperty('--color-paper', colors.paper);
  root.style.setProperty('--color-danger', colors.danger);
  root.style.setProperty('--color-spirit', colors.spirit);

  // Readable text variants + state colors, computed from the above.
  // Set last: --color-ink-muted is intentionally overwritten with its clamped
  // value when the authored one is too faint to read.
  for (const [name, value] of Object.entries(deriveReadableTokens(colors))) {
    root.style.setProperty(name, value);
  }
}

export function applyFont(font: FontOption): void {
  const root = document.documentElement;
  root.style.setProperty('--font-heading', font.heading);
  root.style.setProperty('--font-body', font.body);
  root.style.setProperty('--font-mono', font.mono);

  const existingLink = document.getElementById('theme-font-link');
  if (existingLink) existingLink.remove();

  const link = document.createElement('link');
  link.id = 'theme-font-link';
  link.rel = 'stylesheet';
  link.href = font.googleImport;
  document.head.appendChild(link);
}

export function buildCustomThemeColors(customColors: {
  primary: string;
  accent: string;
  background: string;
  text: string;
  danger?: string;
  spirit?: string;
}): ThemeColors {
  const bg = customColors.background;
  const bgRgb = bg.split(' ').map(Number);
  const isLight = (bgRgb[0] + bgRgb[1] + bgRgb[2]) / 3 > 128;

  const darken = (channels: string, amount: number) => {
    const [r, g, b] = channels.split(' ').map(Number);
    return `${Math.max(0, r - amount)} ${Math.max(0, g - amount)} ${Math.max(0, b - amount)}`;
  };

  const lighten = (channels: string, amount: number) => {
    const [r, g, b] = channels.split(' ').map(Number);
    return `${Math.min(255, r + amount)} ${Math.min(255, g + amount)} ${Math.min(255, b + amount)}`;
  };

  const surface = isLight ? darken(customColors.background, 12) : lighten(customColors.background, 8);
  const paper = isLight ? '254 254 254' : lighten(customColors.background, 20);
  const readableOn = [customColors.background, surface, paper];

  return {
    // Brand and ink are the user's choices, nudged only if they would be
    // unreadable on their own background — text the user cannot read is never
    // what they meant to pick
    brand: ensureReadableOnAll(customColors.primary, readableOn),
    brandDark: isLight ? darken(customColors.primary, 30) : lighten(customColors.primary, 30),
    accent: customColors.accent,
    accentHover: lighten(customColors.accent, 20),
    // Label on an accent-filled button
    accentText: readableTextOn(customColors.accent),
    bgBase: customColors.background,
    bgSurface: surface,
    bgSurfaceLight: isLight ? darken(customColors.background, 5) : lighten(customColors.background, 12),
    bgSurfaceDark: isLight ? darken(customColors.background, 25) : darken(customColors.background, 6),
    ink: ensureReadableOnAll(customColors.text, readableOn),
    inkSecondary: ensureReadableOnAll(
      isLight ? lighten(customColors.text, 60) : darken(customColors.text, 60),
      readableOn
    ),
    inkMuted: ensureReadableOnAll(
      isLight ? lighten(customColors.text, 90) : darken(customColors.text, 90),
      readableOn
    ),
    paper,
    danger: customColors.danger || '192 57 43',
    spirit: customColors.spirit || '147 112 219',
  };
}
