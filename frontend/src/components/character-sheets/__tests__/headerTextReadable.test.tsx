/**
 * The read-only sheets' header text reads on the header colour.
 *
 * The D&D 5e, Pathfinder 2e and Call of Cthulhu sheets drew their header text
 * white on any colour, so on a pale custom colour such as white, or a pale
 * preset such as Amber Gold, the name could not be read. Their editors chose
 * dark text there, so the Pathfinder sheet and its editor disagreed on Golden.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DnD5eCharacterView } from '../dnd5e/DnD5eCharacterView';
import { Pathfinder2eCharacterView } from '../pathfinder2e/Pathfinder2eCharacterView';
import { Pathfinder2eCharacterEditor } from '../pathfinder2e/Pathfinder2eCharacterEditor';
import { CallOfCthulhu7eCharacterView } from '../call-of-cthulhu-7e/CallOfCthulhu7eCharacterView';
import { dnd5eCharacter } from '../dnd5e/__tests__/dnd5eFixture';
import { pf2eCharacter } from '../pathfinder2e/__tests__/pf2eFixture';
import { cocCharacter } from '../call-of-cthulhu-7e/__tests__/cocFixture';
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
  ['D&D 5e', (themeColor: string) => <DnD5eCharacterView character={dnd5eCharacter({ themeColor })} onEdit={vi.fn()} />],
  ['Pathfinder 2e', (themeColor: string) => <Pathfinder2eCharacterView character={pf2eCharacter({ themeColor })} onEdit={vi.fn()} />],
  ['Call of Cthulhu', (themeColor: string) => <CallOfCthulhu7eCharacterView character={cocCharacter({ themeColor })} onEdit={vi.fn()} />],
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

describe('the Pathfinder 2e sheet and its editor', () => {
  it('choose the same header text on Golden', () => {
    const view = render(<Pathfinder2eCharacterView character={pf2eCharacter({ themeColor: 'Golden' })} />);
    const inView = textColour(header(view.container));
    view.unmount();
    const editor = render(
      <Pathfinder2eCharacterEditor character={pf2eCharacter({ themeColor: 'Golden' })} onSave={() => Promise.resolve()} onCancel={vi.fn()} />
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
