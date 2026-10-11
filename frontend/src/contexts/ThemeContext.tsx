/**
 * Theme Context — two-layer model
 *
 * Layer 1 (system): admin-controlled defaults from SystemSettings —
 *   themeId, fontId, customThemeColors, plus instance branding (logo / favicon
 *   / mascot). Renders on public/unauthenticated pages and as the fallback for
 *   users who haven't picked their own theme.
 *
 * Layer 2 (user): per-user overlay from User.preferences. Overrides theme +
 *   font on top of system branding. Applied via `applyUserPreferences` which
 *   is normally driven by ThemeSyncBridge in response to auth state changes.
 *
 * Branding (logo / favicon / mascot) is always system-wide regardless of which
 * layer is active.
 */

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { api } from '@/services/api';
import type { AppearanceSettings, UserPreferences } from '@/types';
import {
  getThemeById,
  getFontById,
  applyThemeColors,
  applyFont,
  buildCustomThemeColors,
  hexToRgbChannels,
  PRESET_THEMES,
  FONT_OPTIONS,
} from '@/themes';
import type { ThemeColors } from '@/themes';

/** The named colours `buildCustomThemeColors` requires. */
type CustomThemeInput = Parameters<typeof buildCustomThemeColors>[0];

// localStorage key for flash-prevention cache. Keep stable across releases —
// changing it would force a one-time flash for every existing user on upgrade.
const USER_THEME_CACHE_KEY = 'cozyvtt_user_theme';

interface UserThemeCache {
  themeId?: string;
  fontId?: string;
  customThemeColors?: { primary: string; accent: string; background: string; text: string } | null;
}

interface ThemeContextValue {
  /**
   * System-level appearance (admin defaults + branding). Used by AdminPage
   * "Default Theme" tab and as fallback when no user is logged in. Kept under
   * the legacy `appearance` name so existing consumers compile unchanged.
   */
  appearance: AppearanceSettings | null;
  /** Re-fetch system appearance from /api/auth/appearance and re-apply. */
  refreshAppearance: () => Promise<void>;

  /** Branding URLs — always derived from system settings. */
  mascotUrl: string;
  logoUrl: string;
  faviconUrl: string;

  /**
   * Apply a user's stored preferences on top of system branding.
   * Pass `null` to revert to the system theme (e.g. on logout).
   */
  applyUserPreferences: (prefs: UserPreferences | null) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  appearance: null,
  refreshAppearance: async () => {},
  mascotUrl: '/default-mascot.png',
  logoUrl: '/default-logo.png',
  faviconUrl: '/default-mascot.png',
  applyUserPreferences: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readUserThemeCache(): UserThemeCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_THEME_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as UserThemeCache) : null;
  } catch {
    return null;
  }
}

function writeUserThemeCache(cache: UserThemeCache) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USER_THEME_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Quota or private-mode — ignore; flash prevention is a nicety, not required.
  }
}

function clearUserThemeCache() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(USER_THEME_CACHE_KEY);
  } catch {
    /* noop */
  }
}

/**
 * A stored custom colour as the "R G B" channels the theme builder reads.
 * Colours are stored as #RRGGBB, the picker's format and the only one the
 * server accepts; channels already are passed through. Anything else is not
 * a colour, and null.
 */
function toChannels(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return hexToRgbChannels(value);
  if (/^\d{1,3} \d{1,3} \d{1,3}$/.test(value) && value.split(' ').every((n) => Number(n) <= 255)) return value;
  return null;
}

/** The builder's input from a stored custom record, or null when one of its four colours is missing or not a colour. */
function customThemeInput(stored: Readonly<Record<string, unknown>>): CustomThemeInput | null {
  const primary = toChannels(stored.primary);
  const accent = toChannels(stored.accent);
  const background = toChannels(stored.background);
  const text = toChannels(stored.text);
  if (primary === null || accent === null || background === null || text === null) return null;
  return { primary, accent, background, text };
}

/**
 * Compute ThemeColors for a given themeId/customThemeColors pair. A custom
 * record that is not four colours paints the default theme, so the page
 * keeps readable colours whatever was stored.
 */
function resolveColors(
  themeId: string | undefined,
  customColors: Readonly<Record<string, unknown>> | null | undefined
): ThemeColors {
  if (themeId === 'custom' && customColors) {
    const input = customThemeInput(customColors);
    if (input) return buildCustomThemeColors(input);
  }
  const theme = getThemeById(themeId || '') || PRESET_THEMES[0];
  return theme.colors;
}

/** Apply a full system AppearanceSettings record (theme + font + favicon). */
function applySystemAppearance(data: AppearanceSettings) {
  applyThemeColors(resolveColors(data.themeId, data.customThemeColors));
  applyFont(getFontById(data.fontId) || FONT_OPTIONS[0]);

  if (data.customFaviconUrl) {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) link.href = data.customFaviconUrl;
  }
}

/** Synchronously paint cached user theme on first render to avoid flash. */
function applyCachedUserTheme(cache: UserThemeCache) {
  if (cache.themeId) {
    applyThemeColors(resolveColors(cache.themeId, cache.customThemeColors ?? null));
  }
  if (cache.fontId) {
    const font = getFontById(cache.fontId);
    if (font) applyFont(font);
  }
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Apply localStorage cache synchronously, before the first paint, so that
  // logged-in users don't see a flash of the admin's default theme on reload.
  // Runs at module-evaluation time of the component (still before child paint).
  const cachedRef = useRef<UserThemeCache | null>(null);
  if (cachedRef.current === null) {
    cachedRef.current = readUserThemeCache() ?? {};
    if (cachedRef.current.themeId || cachedRef.current.fontId) {
      applyCachedUserTheme(cachedRef.current);
    }
  }

  const [appearance, setAppearance] = useState<AppearanceSettings | null>(null);
  // Track whether a user overlay is currently active. While true, we won't
  // re-apply system theme on refreshAppearance (admin saves should still
  // refresh branding, but not stomp the user's chosen palette).
  const userOverlayRef = useRef<UserPreferences | null>(null);

  const refreshAppearance = useCallback(async () => {
    try {
      const data = await api.getAppearance();
      setAppearance(data);

      // Always update favicon (system-wide branding).
      if (data.customFaviconUrl) {
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (link) link.href = data.customFaviconUrl;
      }

      // Only repaint theme/font if no user overlay is active. Otherwise the
      // overlay's chosen theme should stay on screen.
      if (!userOverlayRef.current) {
        applySystemAppearance(data);
      }
    } catch {
      // Defaults already applied via CSS — public pages remain usable offline.
    }
  }, []);

  useEffect(() => {
    refreshAppearance();
  }, [refreshAppearance]);

  const applyUserPreferences = useCallback(
    (prefs: UserPreferences | null) => {
      if (!prefs || (prefs.themeId === undefined && prefs.fontId === undefined)) {
        // Clear overlay → revert to system defaults.
        userOverlayRef.current = null;
        clearUserThemeCache();
        if (appearance) applySystemAppearance(appearance);
        return;
      }

      userOverlayRef.current = prefs;

      // Theme: prefer user choice, fall back to system default.
      const themeId = prefs.themeId ?? appearance?.themeId;
      const customColors =
        prefs.themeId === 'custom'
          ? prefs.customThemeColors ?? null
          : appearance?.themeId === 'custom'
          ? appearance?.customThemeColors ?? null
          : null;
      applyThemeColors(resolveColors(themeId, customColors));

      // Font: prefer user choice, fall back to system default.
      const fontId = prefs.fontId ?? appearance?.fontId ?? 'default';
      applyFont(getFontById(fontId) || FONT_OPTIONS[0]);

      // Cache for flash prevention on next reload.
      writeUserThemeCache({
        themeId: themeId,
        fontId: fontId,
        customThemeColors: prefs.themeId === 'custom' ? prefs.customThemeColors ?? null : null,
      });
    },
    [appearance]
  );

  const mascotUrl = appearance?.customMascotUrl || '/default-mascot.png';
  const logoUrl = appearance?.customLogoUrl || '/default-logo.png';
  const faviconUrl = appearance?.customFaviconUrl || '/default-mascot.png';

  return (
    <ThemeContext.Provider
      value={{
        appearance,
        refreshAppearance,
        mascotUrl,
        logoUrl,
        faviconUrl,
        applyUserPreferences,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
