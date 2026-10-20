/**
 * The instance's name reaches the tab once the server answers.
 *
 * The appearance (the instance name, logo and default theme) was asked for
 * once, as the page loaded; a page loaded while the server was restarting
 * kept the tab title "CozyVTT" and the default branding until reloaded. A
 * failed request is now tried again until the server answers.
 */
import { it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import type { AppearanceSettings } from '@/types';

const getAppearance = vi.fn<() => Promise<AppearanceSettings>>();
vi.mock('@/services/api', () => ({ api: { getAppearance: () => getAppearance() } }));

import { ThemeProvider } from '../ThemeContext';

afterEach(() => {
  vi.useRealTimers();
  document.title = '';
});

it('asks again after a failed request, and names the tab when it answers', async () => {
  vi.useFakeTimers();
  getAppearance
    .mockRejectedValueOnce(new Error('Network Error'))
    .mockResolvedValue({
      instanceName: 'The Gilded Tankard', themeId: 'cozy-default', customThemeColors: null, fontId: 'default',
      customLogoUrl: null, customFaviconUrl: null, customMascotUrl: null,
    } as AppearanceSettings);

  render(<ThemeProvider><p>page</p></ThemeProvider>);
  await act(async () => { await Promise.resolve(); });
  expect(document.title).not.toBe('The Gilded Tankard');

  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(getAppearance).toHaveBeenCalledTimes(2);
  expect(document.title).toBe('The Gilded Tankard');
});
