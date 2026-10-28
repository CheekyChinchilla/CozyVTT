/**
 * The Call of Cthulhu editor scrolls as one page on a phone.
 *
 * Its tab content sat in a box of its own, as tall as the screen less 200 px,
 * that scrolled inside the shell's own scroller. On a phone that is two
 * scrollers, one inside the other, and `100vh` is taller than the part of the
 * screen the browser shows. Below `sm` the box is gone and the sheet scrolls
 * as one; from `sm` up it is as it was, so the editor page's header and tabs
 * stay put while a tab scrolls. jsdom evaluates no media query, so the classes
 * are asserted.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import { cocCharacter } from './cocFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

describe('the Call of Cthulhu editor\'s tab content', () => {
  it('scrolls in a box of its own from sm up only', () => {
    const { container } = render(<CallOfCthulhu7eCharacterEditor character={cocCharacter()} onSave={() => Promise.resolve()} onCancel={vi.fn()} />);
    const body = classes(container.querySelector('[data-sheet-body]'));
    expect(body).toEqual(expect.arrayContaining(['sm:max-h-[calc(100vh-200px)]', 'sm:overflow-y-auto']));
    expect(body).not.toContain('max-h-[calc(100vh-200px)]');
    expect(body).not.toContain('overflow-y-auto');
  });
});
