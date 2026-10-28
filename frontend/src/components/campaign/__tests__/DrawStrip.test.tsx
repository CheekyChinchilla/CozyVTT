/**
 * The drawing tools as the compact layout's strip: every control the
 * desktop's panel has, each doing what the panel's does, 44 pixels for a
 * finger. jsdom evaluates no media query and lays nothing out, so the sizes
 * are checked as the classes that set them.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DrawStrip from '../DrawStrip';
import type { DrawControlsProps } from '../DrawControls';
import { DEFAULT_DRAW_SETTINGS } from '../map/tools/useDrawTool';
import { SHORT_SCREEN_QUERY } from '@/constants/layout';

function strip(extra: Partial<DrawControlsProps> = {}) {
  const props: DrawControlsProps = {
    kind: 'pen', onKindChange: vi.fn(), settings: DEFAULT_DRAW_SETTINGS, onSettingsChange: vi.fn(), isDM: false,
    polygonCorners: 0, onPolygonDone: vi.fn(), onPolygonCancel: vi.fn(), clearable: 2, onClear: vi.fn(), onClose: vi.fn(),
    members: [], onClearMember: vi.fn(),
    ...extra,
  };
  const view = render(<DrawStrip {...props} />);
  return { props, ...view };
}

const classes = (el: Element) => el.className.split(/\s+/);
const region = () => screen.getByRole('region', { name: 'Drawing tools' });

describe('the strip', () => {
  it('is a region named for the drawing tools, headed Draw, and no dialog', () => {
    strip();
    expect(within(region()).getByRole('heading', { name: 'Draw' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers the nine tools in one row that scrolls sideways, the one in use pressed', () => {
    const { props } = strip({ kind: 'arrow' });

    const row = screen.getByRole('group', { name: 'Tools' });
    const names = within(row).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Pen', 'Line', 'Arrow', 'Rectangle', 'Ellipse', 'Polygon', 'Text label', 'Eraser', 'Laser pointer']);
    expect(screen.getByRole('button', { name: 'Arrow' })).toHaveAttribute('aria-pressed', 'true');
    expect(classes(row)).toEqual(expect.arrayContaining(['overflow-x-auto']));
    expect(classes(row)).not.toContain('flex-wrap');

    fireEvent.click(screen.getByRole('button', { name: 'Ellipse' }));
    expect(props.onKindChange).toHaveBeenCalledWith('ellipse');
  });

  it('says what the tool does', () => {
    strip({ kind: 'arrow' });
    expect(region()).toHaveTextContent('Drag from the tail to the point.');
  });

  it('sizes every control for a finger, whatever the pointer', () => {
    strip({ isDM: true, kind: 'rect' });
    fireEvent.click(screen.getByRole('button', { name: 'Colour: Red' }));

    for (const button of screen.getAllByRole('button')) {
      expect(classes(button).some((c) => c === 'size-11' || c === 'min-h-11')).toBe(true);
    }
    for (const box of screen.getAllByRole('checkbox')) expect(classes(box.closest('label')!)).toContain('min-h-11');
    expect(classes(screen.getByLabelText('Another colour').closest('label')!)).toContain('size-11');
  });

  it('keeps clear of a notch on either side', () => {
    strip();
    expect(classes(region())).toEqual(expect.arrayContaining([
      'pl-[max(1rem,env(safe-area-inset-left))]', 'pr-[max(0.5rem,env(safe-area-inset-right))]',
    ]));
  });

  it('puts the tools away on Done', () => {
    const { props } = strip();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe('the colour', () => {
  it('names the colour on its button, and opens the eight colours and another', () => {
    strip();
    const button = screen.getByRole('button', { name: 'Colour: Red' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Green' })).toBeNull();

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    const colours = screen.getByRole('group', { name: 'Colour' });
    expect(button).toHaveAttribute('aria-controls', colours.id);
    expect(within(colours).getAllByRole('button').map((b) => b.getAttribute('aria-label')))
      .toEqual(['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'White', 'Black']);
    expect(within(colours).getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(colours).getByLabelText('Another colour')).toBeInTheDocument();
  });

  it('sets the colour chosen and closes the colours', () => {
    const { props } = strip();
    fireEvent.click(screen.getByRole('button', { name: 'Colour: Red' }));
    fireEvent.click(screen.getByRole('button', { name: 'Green' }));

    expect(props.onSettingsChange).toHaveBeenCalledWith({ color: '#4caf6e' });
    expect(screen.queryByRole('group', { name: 'Colour' })).toBeNull();
  });

  it('sets another colour, and calls one off the eight Another colour', () => {
    const { props, rerender } = strip();
    fireEvent.click(screen.getByRole('button', { name: 'Colour: Red' }));
    fireEvent.change(screen.getByLabelText('Another colour'), { target: { value: '#123456' } });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ color: '#123456' });

    rerender(<DrawStrip {...props} settings={{ ...DEFAULT_DRAW_SETTINGS, color: '#123456' }} />);
    expect(screen.getByRole('button', { name: 'Colour: Another colour' })).toBeInTheDocument();
  });

  it('offers the colour and no width under the laser pointer, and neither under the eraser', () => {
    const { rerender, props } = strip({ kind: 'laser' });
    expect(screen.getByRole('button', { name: 'Colour: Red' })).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Width' })).toBeNull();

    rerender(<DrawStrip {...props} kind="eraser" />);
    expect(screen.queryByRole('button', { name: /^Colour/ })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Width' })).toBeNull();
  });
});

describe('the width', () => {
  it('sets the width, and says how tall a label’s letters are', () => {
    const { props, rerender } = strip();
    fireEvent.change(screen.getByRole('slider', { name: 'Width' }), { target: { value: '9' } });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ width: 9 });

    rerender(<DrawStrip {...props} kind="text" />);
    expect(region()).toHaveTextContent(`(letters ${DEFAULT_DRAW_SETTINGS.width * 4} px tall)`);
  });
});

describe('the chips', () => {
  it('offers Fill shapes for the closed shapes only, and Snap to grid for every shape', () => {
    const { props, rerender } = strip({ kind: 'line' });
    expect(screen.getByRole('checkbox', { name: 'Snap to grid' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Fill shapes' })).toBeNull();

    rerender(<DrawStrip {...props} kind="ellipse" />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fill shapes' }));
    expect(props.onSettingsChange).toHaveBeenCalledWith({ fill: true });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Snap to grid' }));
    expect(props.onSettingsChange).toHaveBeenCalledWith({ snap: true });
  });

  it('offers neither on the pen', () => {
    strip({ kind: 'pen' });
    expect(screen.queryByRole('checkbox', { name: 'Snap to grid' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Fill shapes' })).toBeNull();
  });

  it('gives the DM Only I can see this, and none under the laser pointer, which everyone sees', () => {
    const { props, rerender } = strip({ isDM: true });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Only I can see this' }));
    expect(props.onSettingsChange).toHaveBeenCalledWith({ dmOnly: true });

    rerender(<DrawStrip {...props} kind="laser" settings={{ ...DEFAULT_DRAW_SETTINGS, dmOnly: true }} />);
    expect(screen.queryByRole('checkbox', { name: 'Only I can see this' })).toBeNull();
    expect(screen.getByText('Everyone sees the laser pointer.')).toBeInTheDocument();
  });

  it('gives a player no Only I can see this', () => {
    strip({ isDM: false });
    expect(screen.queryByRole('checkbox', { name: 'Only I can see this' })).toBeNull();
  });
});

describe('a polygon', () => {
  it('puts its Cancel and Done in the header while it is open, Done waiting for its third corner', () => {
    const { props, rerender } = strip({ kind: 'polygon', polygonCorners: 2 });

    // One Done at a time: the polygon's, which the hint names.
    expect(screen.getAllByRole('button', { name: 'Done' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Clear mine' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onPolygonCancel).toHaveBeenCalled();

    rerender(<DrawStrip {...props} polygonCorners={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(props.onPolygonDone).toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('keeps the header’s Done putting the tools away before its first corner', () => {
    const { props } = strip({ kind: 'polygon', polygonCorners: 0 });
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe('who may draw what', () => {
  it('offers only the eraser to a player who may not draw now, and says why', () => {
    strip({ kind: 'eraser', onlyErase: true });
    expect(within(screen.getByRole('group', { name: 'Tools' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Eraser']);
    expect(region()).toHaveTextContent('Drawing is off for now. Tap or click a drawing to erase it. You can erase only your own.');
  });
});

describe('clearing', () => {
  it('gives a player Clear mine, at once', () => {
    const { props } = strip({ isDM: false });
    fireEvent.click(screen.getByRole('button', { name: 'Clear mine' }));
    expect(props.onClear).toHaveBeenCalled();
  });

  it('turns Clear mine and Clear… off with nothing to clear', () => {
    const { props, rerender } = strip({ clearable: 0 });
    expect(screen.getByRole('button', { name: 'Clear mine' })).toBeDisabled();
    rerender(<DrawStrip {...props} isDM />);
    expect(screen.getByRole('button', { name: 'Clear…' })).toBeDisabled();
  });

  it('asks the DM before clearing every drawing, saying how many, with no member’s to choose', () => {
    const { props } = strip({ isDM: true, clearable: 3 });

    fireEvent.click(screen.getByRole('button', { name: 'Clear…' }));
    expect(props.onClear).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('3 drawings');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear drawings' }));

    expect(props.onClear).toHaveBeenCalled();
  });

  const members = [{ authorId: 'mara', name: 'Mara', count: 3 }, { authorId: 'tom', name: 'Tom', count: 1 }];

  it('offers the DM every drawing or one member’s, each asked first', () => {
    const { props } = strip({ isDM: true, clearable: 5, members });

    fireEvent.click(screen.getByRole('button', { name: 'Clear…' }));
    const choices = screen.getByRole('dialog', { name: 'Clear drawings on this map' });
    expect(within(choices).getAllByRole('button').map((b) => b.textContent!.trim()))
      .toEqual(['Clear drawings', "Clear Mara's drawings (3)", "Clear Tom's drawings (1)", 'Cancel']);

    fireEvent.click(within(choices).getByRole('button', { name: "Clear Mara's drawings (3)" }));
    expect(screen.queryByRole('dialog', { name: 'Clear drawings on this map' })).toBeNull();
    expect(props.onClearMember).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Mara');
    expect(dialog).toHaveTextContent('3 drawings');
    fireEvent.click(within(dialog).getByRole('button', { name: "Clear Mara's drawings" }));

    expect(props.onClearMember).toHaveBeenCalledWith('mara');
    expect(props.onClear).not.toHaveBeenCalled();
  });

  it('asks before clearing every drawing chosen from the DM’s choices', () => {
    const { props } = strip({ isDM: true, clearable: 5, members });
    fireEvent.click(screen.getByRole('button', { name: 'Clear…' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Clear drawings on this map' })).getByRole('button', { name: 'Clear drawings' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('5 drawings');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear drawings' }));
    expect(props.onClear).toHaveBeenCalled();
  });
});

// On a phone in landscape the map is about 250 pixels tall, and the strip
// was as tall: nothing left to draw on, and its header, the way to put the
// tools away, pushed past the map's top.
describe('the strip’s height', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  /** A screen under 500 pixels tall, as `SHORT_SCREEN_QUERY` answers it. */
  function shortScreen() {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === SHORT_SCREEN_QUERY, media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    }));
  }
  const header = () => screen.getByRole('heading', { name: 'Draw' }).parentElement!;
  const body = () => region().querySelector<HTMLElement>('[data-strip-body]')!;

  it('is at most half the map’s height, less on a short screen, its body scrolling under its header', () => {
    strip({ isDM: true, kind: 'rect' });

    expect(classes(region())).toEqual(expect.arrayContaining(['max-h-[50cqh]', 'short:max-h-[45cqh]', 'flex-col']));
    expect(classes(header())).toContain('shrink-0');
    expect(body()).not.toContainElement(header());
    expect(classes(body())).toEqual(expect.arrayContaining(['min-h-0', 'overflow-y-auto', 'overscroll-contain']));
    expect(body()).toContainElement(screen.getByRole('checkbox', { name: 'Snap to grid' }));
  });

  it('opens the colours in the body, so the header stays in reach', () => {
    strip();
    fireEvent.click(screen.getByRole('button', { name: 'Colour: Red' }));
    expect(body()).toContainElement(screen.getByRole('group', { name: 'Colour' }));
    expect(header()).toContainElement(screen.getByRole('button', { name: 'Done' }));
  });

  it('keeps a polygon’s Cancel and Done in the header', () => {
    strip({ kind: 'polygon', polygonCorners: 2 });
    expect(header()).toContainElement(screen.getByRole('button', { name: 'Cancel' }));
    expect(header()).toContainElement(screen.getByRole('button', { name: 'Done' }));
  });

  it('puts the tools in the header’s row on a short screen, the rest in the body', () => {
    shortScreen();
    strip();
    expect(header()).toContainElement(screen.getByRole('group', { name: 'Tools' }));
    expect(body()).toContainElement(screen.getByRole('button', { name: 'Colour: Red' }));
  });

  it('keeps the tools under the hint on a tall screen', () => {
    strip();
    expect(body()).toContainElement(screen.getByRole('group', { name: 'Tools' }));
    // A scroller in a column may shrink below its buttons; this one does not.
    expect(classes(screen.getByRole('group', { name: 'Tools' }))).toContain('shrink-0');
  });
});
