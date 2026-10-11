/**
 * A saved Custom theme paints the page with the colours it holds.
 *
 * Custom colours are stored as #RRGGBB, the format the colour picker gives
 * and the server checks. The theme builder works on "R G B" channel strings,
 * and the picker's own preview converted before calling it, but the colours
 * painted on load (and after a save) were passed to it unconverted: the
 * background read as NaN, every surface colour came out "NaN NaN NaN", and
 * the page lost its colours for everyone the theme applied to.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import type { AppearanceSettings, UserPreferences } from '@/types';

const getAppearance = vi.fn<() => Promise<AppearanceSettings>>();
vi.mock('@/services/api', () => ({ api: { getAppearance: () => getAppearance() } }));

import { ThemeProvider, useTheme } from '../ThemeContext';

const CUSTOM = { primary: '#7C9A6E', accent: '#D4A55A', background: '#FAF6EC', text: '#3A2E26' };

const appearance = (over: Partial<AppearanceSettings>): AppearanceSettings => ({
  instanceName: 'CozyVTT',
  themeId: 'cozy-default',
  customThemeColors: null,
  fontId: 'default',
  customLogoUrl: null,
  customFaviconUrl: null,
  customMascotUrl: null,
  ...over,
});

const painted = (name: string) => document.documentElement.style.getPropertyValue(name);

/** Every theme colour the page was painted with. */
const allPainted = () =>
  Array.from(document.documentElement.style)
    .filter((name) => name.startsWith('--color-'))
    .map((name) => [name, painted(name)] as const);

let applyUserPreferences: (prefs: UserPreferences | null) => void = () => undefined;
function Grab() {
  applyUserPreferences = useTheme().applyUserPreferences;
  return null;
}

beforeEach(() => {
  document.documentElement.removeAttribute('style');
  localStorage.clear();
  getAppearance.mockReset();
});

describe('a Custom theme stored as hex colours', () => {
  it('paints the instance default as channel values, with no NaN', async () => {
    getAppearance.mockResolvedValue(appearance({ themeId: 'custom', customThemeColors: CUSTOM }));

    render(<ThemeProvider><Grab /></ThemeProvider>);

    await waitFor(() => expect(painted('--color-bg-base')).toBe('250 246 236'));
    expect(painted('--color-accent')).toBe('212 165 90');
    expect(allPainted().filter(([, value]) => value.includes('NaN') || value.includes('#'))).toEqual([]);
  });

  it("paints a user's own Custom theme as channel values", async () => {
    getAppearance.mockResolvedValue(appearance({}));
    render(<ThemeProvider><Grab /></ThemeProvider>);
    await waitFor(() => expect(getAppearance).toHaveBeenCalled());

    act(() => applyUserPreferences({ themeId: 'custom', customThemeColors: CUSTOM }));

    expect(painted('--color-bg-base')).toBe('250 246 236');
    expect(allPainted().filter(([, value]) => value.includes('NaN') || value.includes('#'))).toEqual([]);
  });

  it('falls back to the default theme when the stored colours are not colours', async () => {
    getAppearance.mockResolvedValue(
      appearance({ themeId: 'custom', customThemeColors: { primary: '#FFFFFF', background: 'red' } })
    );

    render(<ThemeProvider><Grab /></ThemeProvider>);

    await waitFor(() => expect(painted('--color-bg-base')).not.toBe(''));
    expect(allPainted().filter(([, value]) => value.includes('NaN') || value.includes('red'))).toEqual([]);
  });
});
