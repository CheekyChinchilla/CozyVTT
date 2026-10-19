/**
 * A dark theme tells the browser it is dark.
 *
 * No theme set `color-scheme`, so in Obsidian Night and the other dark themes
 * the browser still drew its own controls light: text boxes, checkboxes and
 * the open list of a dropdown, with the theme's light text inside them.
 * Checkboxes, radios and sliders take the theme's brand colour.
 */

import { describe, it, expect, afterEach } from 'vitest';
import indexCss from '../../index.css?raw';
import { PRESET_THEMES, applyThemeColors } from '../../themes';

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

describe('color-scheme', () => {
  it.each(PRESET_THEMES.map((theme) => [theme.name, theme] as const))('follows %s', (_name, theme) => {
    applyThemeColors(theme.colors);
    expect(document.documentElement.style.colorScheme).toBe(theme.category === 'dark' ? 'dark' : 'light');
  });

  it('follows a custom theme by how light its paper is', () => {
    const dark = PRESET_THEMES.find((theme) => theme.id === 'obsidian-night')!;
    applyThemeColors({ ...dark.colors, paper: '250 250 250' });
    expect(document.documentElement.style.colorScheme).toBe('light');
    applyThemeColors({ ...PRESET_THEMES[0].colors, paper: '30 30 35' });
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});

it('gives checkboxes, radios and sliders the brand colour', () => {
  expect(indexCss).toMatch(/input\[type='checkbox'\],\s*input\[type='radio'\],\s*input\[type='range'\]\s*\{\s*accent-color: rgb\(var\(--rgb-brand\)\);/);
});
