import { describe, it, expect } from 'vitest';
import { headerInk, shouldUseWhiteText, toStoredHexColor } from '../themeColor';
import { AA_TEXT, contrastRatio } from '../color';
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

// A button or chip on a sheet header is the header with a translucent white or
// black laid over it, and its label is the header's text colour. Lightening
// behind white text took the Call of Cthulhu Dark Forest header's Edit and
// Cancel to 4.47:1 where its gradient is lightest (green-800, #166534).
describe('headerInk fills', () => {
  const rgb = (hex: string): [number, number, number] =>
    [0, 2, 4].map((at) => parseInt(hex.replace('#', '').slice(at, at + 2), 16)) as [number, number, number];
  const fills = (classes: string) =>
    [...classes.matchAll(/bg-(white|black)\/(\d+)/g)].map(([, tone, percent]) => ({ tone: tone === 'white' ? 255 : 0, alpha: Number(percent) / 100 }));
  const under = (header: [number, number, number], fill: { tone: number; alpha: number }) =>
    header.map((c) => c * (1 - fill.alpha) + fill.tone * fill.alpha) as [number, number, number];
  const labelOf = (hex: string) => (headerInk(hex).text === 'text-white' ? [255, 255, 255] : [0, 0, 0]) as [number, number, number];

  const greys = Array.from({ length: 52 }, (_, i) => `#${(i * 5).toString(16).padStart(2, '0').repeat(3)}`);
  const headers = [...DND5E, ...PF2E, ...COC7E].map((preset) => preset.hex).concat(greys, ['#166534', '#ffeecc', '#d97706', '#7c3aed']);

  it('never take the label below what it reads on the bare header', () => {
    for (const hex of headers) {
      const ink = headerInk(hex);
      const label = labelOf(hex);
      const bare = contrastRatio(label, rgb(hex));
      for (const fill of [ink.button, ink.chip, ink.chipFaint].flatMap(fills)) {
        expect(contrastRatio(label, under(rgb(hex), fill)), `${hex} under ${fill.tone ? 'white' : 'black'}/${fill.alpha}`).toBeGreaterThanOrEqual(bare);
      }
    }
  });

  it('keep the Dark Forest Edit and Cancel labels readable at the light end of its gradient', () => {
    const forest = COC7E.find((preset) => preset.name === 'Dark Forest')!;
    const ink = headerInk(forest.hex);
    for (const fill of fills(ink.button)) {
      expect(contrastRatio(labelOf(forest.hex), under(rgb('#166534'), fill))).toBeGreaterThanOrEqual(AA_TEXT);
    }
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
