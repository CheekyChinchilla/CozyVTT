/**
 * The flexible sheet's editor by touch.
 *
 * Every section and every list entry could be dragged from anywhere on it,
 * which framer-motion allows by setting `touch-action: pan-x` and
 * `user-select: none` on the entry: a vertical swipe that began on a section
 * moved the section and the page did not scroll, on a phone and on a tablet.
 * A finger or a pen now drags by the grip only, and a swipe anywhere else
 * scrolls; a mouse drags from anywhere but a text box, as before. The delete
 * buttons showed only while the pointer was over their row, so a finger never
 * saw them; they show wherever nothing can hover, at 44 px. The title and
 * entry boxes shrink beside them on a phone.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DragControls } from 'framer-motion';
import type { Character } from '@/types';
import { FlexibleCharacterSheetEdit } from '../flexible/FlexibleCharacterSheetEdit';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

const character = {
  id: 'flex-1', userId: 'user-1', name: 'Freeform', gameSystem: null, campaignId: 'c-1', tokenImageUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  data: {
    sections: [
      { id: 's1', title: 'Attributes', type: 'stats', fields: [{ id: 'f1', name: 'Grit', value: 14, modifier: 2 }] },
      { id: 's2', title: 'Gear', type: 'list', items: [{ id: 'i1', text: 'Rope', checked: false }] },
      { id: 's3', title: 'Ledger', type: 'table', columns: [{ id: 'c1', name: 'Item' }, { id: 'c2', name: 'Cost' }], rows: [{ id: 'r1', cells: { c1: 'Lamp', c2: '2' } }] },
    ],
  },
} as unknown as Character;

const show = () => render(<FlexibleCharacterSheetEdit character={character} onSave={vi.fn()} onCancel={vi.fn()} />);

/** A section's draggable entry, found from its title box. */
const section = (title: string) => screen.getByDisplayValue(title).closest('li')!;
/** A list entry's draggable entry, found from its text box. */
const entry = (text: string) => screen.getByDisplayValue(text).closest('li')!;
const grip = (of: Element) => of.querySelector('[data-drag-grip]')!;

afterEach(() => vi.restoreAllMocks());

describe('the flexible editor by touch', () => {
  it('leaves a swipe that starts on a section or a list entry to scroll the page', () => {
    show();
    for (const item of [section('Attributes'), entry('Rope')]) {
      expect(item.style.touchAction).toBe('');
      expect(item.style.userSelect).toBe('');
    }
  });

  it('drags a section or a list entry by its grip with a finger or a pen', () => {
    const start = vi.spyOn(DragControls.prototype, 'start').mockImplementation(() => undefined);
    show();
    for (const item of [section('Gear'), entry('Rope')]) {
      expect(classes(grip(item))).toContain('touch-none');
      fireEvent.pointerDown(grip(item), { pointerType: 'touch' });
      fireEvent.pointerDown(grip(item), { pointerType: 'pen' });
    }
    expect(start).toHaveBeenCalledTimes(4);
  });

  it('does not drag when a finger presses anywhere else on a section', () => {
    const start = vi.spyOn(DragControls.prototype, 'start').mockImplementation(() => undefined);
    show();
    fireEvent.pointerDown(section('Attributes').querySelector('[data-drag-grip]')!.parentElement!, { pointerType: 'touch' });
    fireEvent.pointerDown(screen.getByDisplayValue('Grit'), { pointerType: 'touch' });
    expect(start).not.toHaveBeenCalled();
  });

  it('drags from anywhere on a section with a mouse, but not from a text box', () => {
    const start = vi.spyOn(DragControls.prototype, 'start').mockImplementation(() => undefined);
    show();
    const item = section('Attributes');
    fireEvent.pointerDown(grip(item).parentElement!, { pointerType: 'mouse' });
    expect(start).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(grip(item), { pointerType: 'mouse' });
    expect(start).toHaveBeenCalledTimes(2);
    fireEvent.pointerDown(screen.getByDisplayValue('Attributes'), { pointerType: 'mouse' });
    expect(start).toHaveBeenCalledTimes(2);
    expect(classes(item)).toContain('pointer-fine:select-none');
  });

  it.each(['Remove section', 'Remove item', 'Remove column', 'Remove row', 'Remove stat'])('shows %s where nothing can hover, at 44 px on a touch screen', (title) => {
    show();
    const buttons = screen.getAllByTitle(title);
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(classes(button)).toEqual(expect.arrayContaining(['opacity-0', 'group-hover:opacity-100', '[@media(hover:none)]:opacity-100', 'touch-target']));
    }
  });

  it('sizes the grips for a finger', () => {
    show();
    for (const item of [section('Gear'), entry('Rope')]) expect(classes(grip(item))).toContain('touch-target');
  });

  it('lets a section\'s title and a list entry\'s text shrink beside their buttons', () => {
    show();
    expect(classes(screen.getByDisplayValue('Attributes'))).toContain('min-w-0');
    expect(classes(screen.getByDisplayValue('Rope'))).toContain('min-w-0');
  });

  it('keeps a stat\'s name clear of its delete button where the button always shows', () => {
    show();
    expect(classes(screen.getByDisplayValue('Grit'))).toContain('[@media(hover:none)]:pr-12');
  });
});
