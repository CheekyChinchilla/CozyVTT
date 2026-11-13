/**
 * The notes under an editor's portrait.
 *
 * From `sm` up the refused-picture message and "Saves as personal token"
 * were each placed on their own at the foot of the portrait, so with both
 * showing (a refused picture on a character in no campaign) one was drawn
 * over the other. The 5E, Fantasy d20, Horror d100 and Flexible
 * editors now draw one box under the portrait holding both, one under the
 * other.
 *
 * That box was then hung under the portrait out of the flow, on one line, so
 * from `sm` up "Saves as personal token" ran past the portrait into the field
 * beside it (the Horror d100 Age box). It now stays in the flow of the
 * portrait's column at every width, so it takes the portrait's width and
 * wraps. jsdom lays nothing out: the classes are asserted here, and the
 * browser shows the layout.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PortraitNotes from '../PortraitNotes';

const classes = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/);
/** The utility applies at some width: bare, or behind any breakpoint. */
const atSomeWidth = (list: string[], utility: string) => list.some((c) => c === utility || c.endsWith(`:${utility}`));

describe('the notes under a portrait', () => {
  it('stand one under the other in one box under the portrait', () => {
    render(<PortraitNotes error="That picture is not a token picture." personal errorClassName="text-danger-ink" noteClassName="text-warning-ink" />);
    const error = screen.getByText('That picture is not a token picture.');
    const note = screen.getByText('Saves as personal token');
    const box = error.parentElement!;
    expect(note.parentElement).toBe(box);
    for (const line of [error, note]) expect(classes(line)).not.toContain('sm:absolute');
    expect(classes(error)).toContain('text-danger-ink');
    expect(classes(note)).toContain('text-warning-ink');
  });

  it('stay in the flow at every width, so they wrap within the portrait\'s column', () => {
    render(<PortraitNotes error="That picture is not a token picture." personal errorClassName="" noteClassName="" />);
    const box = screen.getByText('Saves as personal token').parentElement!;
    for (const list of [classes(box), ...[...box.children].map(classes)]) {
      for (const utility of ['absolute', 'fixed', 'whitespace-nowrap', 'w-max', 'w-fit']) {
        expect(atSomeWidth(list, utility), `${utility} in "${list.join(' ')}"`).toBe(false);
      }
    }
  });

  it('draws nothing with neither', () => {
    const { container } = render(<PortraitNotes error={null} personal={false} errorClassName="" noteClassName="" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('the four editors', () => {
  const SOURCES = import.meta.glob([
    '/src/components/character-sheets/fifth-edition/FifthEditionCharacterEditor.tsx',
    '/src/components/character-sheets/fantasy-d20/FantasyD20CharacterEditor.tsx',
    '/src/components/character-sheets/horror-d100/HorrorD100CharacterEditor.tsx',
    '/src/components/character-sheets/flexible/FlexibleCharacterSheetEdit.tsx',
  ], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

  it('draw their notes with PortraitNotes, and place none on its own', () => {
    expect(Object.keys(SOURCES)).toHaveLength(4);
    for (const source of Object.values(SOURCES)) {
      expect(source).toContain('<PortraitNotes');
      expect(source).not.toMatch(/sm:absolute sm:top-full sm:whitespace-nowrap/);
    }
  });
});
