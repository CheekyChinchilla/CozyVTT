import { describe, it, expect } from 'vitest';
import { shouldUseWhiteText, toStoredHexColor } from '../themeColor';
import { THEME_COLOR_PATTERN } from '../styleAllowlists';
import { COLOR_PRESETS as DND5E } from '@/components/character-sheets/dnd5e/colorPresets';
import { COLOR_PRESETS as PF2E } from '@/components/character-sheets/pathfinder2e/colorPresets';
import { COLOR_PRESETS as COC7E } from '@/components/character-sheets/call-of-cthulhu-7e/colorPresets';

describe('shouldUseWhiteText', () => {
  it('puts white text on a dark header and dark text on a light one', () => {
    expect(shouldUseWhiteText('#000000')).toBe(true);
    expect(shouldUseWhiteText('#ffffff')).toBe(false);
    expect(shouldUseWhiteText('#b91c1c')).toBe(true);
    // Amber Gold sits just above the line, so its header text is dark.
    expect(shouldUseWhiteText('#d97706')).toBe(false);
  });

  it('reads the colour with or without its #', () => {
    expect(shouldUseWhiteText('1d4ed8')).toBe(shouldUseWhiteText('#1d4ed8'));
  });
});

describe('toStoredHexColor', () => {
  it('keeps #rrggbb, expands #rgb and refuses anything else', () => {
    expect(toStoredHexColor(' #B91C1C ')).toBe('#B91C1C');
    expect(toStoredHexColor('#fa0')).toBe('#ffaa00');
    expect(toStoredHexColor('#')).toBeNull();
    expect(toStoredHexColor('#12345')).toBeNull();
  });
});

describe.each([
  ['D&D 5e', DND5E],
  ['Pathfinder 2e', PF2E],
  ['Call of Cthulhu', COC7E],
] as const)('the %s header colours', (_system, presets) => {
  it('each have a name the server will store', () => {
    for (const preset of presets) expect(preset.name).toMatch(THEME_COLOR_PATTERN);
  });

  it('have names no two share, since the name is what a sheet saves', () => {
    const names = presets.map((preset) => preset.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('each carry a #rrggbb colour', () => {
    for (const preset of presets) expect(toStoredHexColor(preset.hex)).toBe(preset.hex);
  });
});
