/**
 * The browser tab shows the instance's name.
 *
 * The name an admin gives the instance was stored and never shown: the tab
 * said CozyVTT whatever it was. It now comes with the appearance every page
 * reads, and becomes the page title.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { AppearanceSettings } from '@/types';

const getAppearance = vi.fn<() => Promise<AppearanceSettings>>();
vi.mock('@/services/api', () => ({ api: { getAppearance: () => getAppearance() } }));

import { ThemeProvider } from '../ThemeContext';

const appearance = (instanceName: string): AppearanceSettings => ({
  instanceName,
  themeId: 'cozy-default',
  customThemeColors: null,
  fontId: 'default',
  customLogoUrl: null,
  customFaviconUrl: null,
  customMascotUrl: null,
});

beforeEach(() => {
  document.title = 'CozyVTT';
  getAppearance.mockReset();
});

describe('the page title', () => {
  it('is the instance name', async () => {
    getAppearance.mockResolvedValue(appearance('The Hearthstone Tavern'));

    render(<ThemeProvider><div /></ThemeProvider>);

    await waitFor(() => expect(document.title).toBe('The Hearthstone Tavern'));
  });

  it('stays CozyVTT when the name is empty', async () => {
    getAppearance.mockResolvedValue(appearance('   '));

    render(<ThemeProvider><div /></ThemeProvider>);

    await waitFor(() => expect(getAppearance).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.title).toBe('CozyVTT');
  });
});
