/**
 * The read-only sheets' header text reads on the header colour.
 *
 * The 5E, Fantasy d20 and Horror d100 sheets drew their header text
 * white on any colour, so on a pale custom colour such as white, or a pale
 * preset such as Amber Gold, the name could not be read. Their editors chose
 * dark text there, so the Fantasy d20 sheet and its editor disagreed on Golden.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FifthEditionCharacterView } from '../fifth-edition/FifthEditionCharacterView';
import { FantasyD20CharacterView } from '../fantasy-d20/FantasyD20CharacterView';
import { FantasyD20CharacterEditor } from '../fantasy-d20/FantasyD20CharacterEditor';
import { HorrorD100CharacterView } from '../horror-d100/HorrorD100CharacterView';
import { fifthEditionCharacter } from '../fifth-edition/__tests__/fifthEditionFixture';
import { fantasyD20Character } from '../fantasy-d20/__tests__/fantasyD20Fixture';
import { horrorD100Character } from '../horror-d100/__tests__/sheetFixture';
import { headerInk, shouldUseWhiteText } from '@/utils/themeColor';
import { parseRgb, readableTextOn, relativeLuminance } from '@/utils/color';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const header = (container: HTMLElement) => {
  const found = container.querySelector<HTMLElement>('[data-sheet-header]');
  if (!found) throw new Error('no header');
  return found;
};
const textColour = (element: HTMLElement) =>
  element.className.split(/\s+/).find((name) => name === 'text-white' || name === 'text-black');

describe.each([
  ['5E', (themeColor: string) => <FifthEditionCharacterView character={fifthEditionCharacter({ themeColor })} onEdit={vi.fn()} />],
  ['Fantasy d20', (themeColor: string) => <FantasyD20CharacterView character={fantasyD20Character({ themeColor })} onEdit={vi.fn()} />],
  ['Horror d100', (themeColor: string) => <HorrorD100CharacterView character={horrorD100Character({ themeColor })} onEdit={vi.fn()} />],
])('the %s read-only header', (_system, sheet) => {
  it('is dark on a white custom colour, its softer text and Edit button too', () => {
    const { container } = render(sheet('#ffffff'));
    const top = header(container);
    expect(textColour(top)).toBe('text-black');
    expect(top.querySelector('h2')?.className ?? '').not.toContain('text-white');
    // The empty picture is a dark circle on any header, with a pale figure.
    const paleText = [...top.querySelectorAll('[class*="text-white"]')].filter((element) => !element.closest('.bg-black\\/70'));
    expect(paleText).toEqual([]);
    const edit = screen.getByRole('button', { name: /Edit/ });
    // The fill under its label is the shared one for a pale header (headerInk).
    expect(edit.className).toContain(headerInk('#ffffff').button);
    expect(edit.className).not.toContain('text-white');
  });

  it('stays light on a dark custom colour', () => {
    const { container } = render(sheet('#111111'));
    expect(textColour(header(container))).toBe('text-white');
  });
});

describe('the Fantasy d20 sheet and its editor', () => {
  it('choose the same header text on Golden', () => {
    const view = render(<FantasyD20CharacterView character={fantasyD20Character({ themeColor: 'Golden' })} />);
    const inView = textColour(header(view.container));
    view.unmount();
    const editor = render(
      <FantasyD20CharacterEditor character={fantasyD20Character({ themeColor: 'Golden' })} onSave={() => Promise.resolve()} onCancel={vi.fn()} />
    );
    expect(inView).toBe(textColour(header(editor.container)));
    expect(inView).toBe('text-black');
  });
});

describe('shouldUseWhiteText', () => {
  it('agrees with readableTextOn on which way the text goes', () => {
    for (let value = 0; value <= 255; value += 5) {
      for (const hex of [
        `#${value.toString(16).padStart(2, '0').repeat(3)}`,
        `#${value.toString(16).padStart(2, '0')}4080`,
        `#80${value.toString(16).padStart(2, '0')}20`,
      ]) {
        const background = parseRgb([1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(' '));
        const text = parseRgb(readableTextOn(background.join(' ')));
        expect(shouldUseWhiteText(hex), hex).toBe(relativeLuminance(text) > relativeLuminance(background));
      }
    }
  });
});
