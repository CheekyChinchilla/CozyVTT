/**
 * Paint's tools as the compact layout's strip: every control of the
 * desktop's panel, each doing what the panel's does, 44 pixels for a finger,
 * the tools in one row that scrolls sideways with the shared scroll cue, and
 * the colours and the width in a pop-over. jsdom evaluates no media query
 * and lays nothing out, so the sizes are checked as the classes that set
 * them.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import PaintStrip from '../PaintStrip';
import type { PaintControlsProps } from '../PaintControls';
import { DEFAULT_PAINT_SETTINGS, type PaintSettings } from '../map/paint/usePaintSurface';
import { SHORT_SCREEN_QUERY } from '@/constants/layout';
import { layScrollRow, readScrollCue } from '@/test/scrollCue';

function strip(extra: Partial<PaintControlsProps> = {}, settings: Partial<PaintSettings> = {}) {
  const props: PaintControlsProps = {
    settings: { ...DEFAULT_PAINT_SETTINGS, ...settings }, onSettingsChange: vi.fn(), canUndo: true, canRedo: false,
    onUndo: vi.fn(), onRedo: vi.fn(), unsaved: true, onSave: vi.fn(), saving: false, onDownload: vi.fn(), onClose: vi.fn(),
    ...extra,
  };
  const view = render(<PaintStrip {...props} />);
  return { props, ...view };
}

const classes = (el: Element) => el.className.split(/\s+/);
const region = () => screen.getByRole('region', { name: 'Mapmaker' });
const row = () => screen.getByRole('group', { name: 'Tools' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the strip', () => {
  it('is a region named Paint, headed Paint, and no dialog', () => {
    strip();
    expect(within(region()).getByRole('heading', { name: 'Mapmaker' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers the thirteen tools in one row that scrolls sideways, the one in use pressed', () => {
    const { props } = strip({}, { tool: 'line' });
    const names = within(row()).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Select', 'Brush', 'Eraser', 'Line', 'Rectangle', 'Ellipse', 'Polygon', 'Curve', 'Room', 'Stamp', 'Fill', 'Text', 'Eyedropper']);
    expect(screen.getByRole('button', { name: 'Line' })).toHaveAttribute('aria-pressed', 'true');
    expect(classes(row())).toContain('overflow-x-auto');
    expect(classes(row())).not.toContain('flex-wrap');
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }));
    expect(props.onSettingsChange).toHaveBeenCalledWith({ tool: 'fill' });
  });

  it('fades and marks the end past which more tools lie', () => {
    strip();
    layScrollRow(row(), { width: 380, shown: 300, left: 0 });
    expect(readScrollCue(row()).marks).toEqual(['right']);
    layScrollRow(row(), { width: 300, shown: 300 });
    expect(readScrollCue(row())).toEqual({ fade: [], marks: [] });
  });

  it('says what the tool does', () => {
    strip({}, { tool: 'eyedropper' });
    expect(region()).toHaveTextContent('Click or tap the picture to take its colour there');
  });

  it('tells a finger on Stamp that it slides the stamp, and two fingers move the map', () => {
    strip({}, { tool: 'stamp' });
    expect(region()).not.toHaveTextContent("A finger's drag moves the map");
    expect(region()).toHaveTextContent('slide a finger to move the stamp and lift it to paint');
  });

  it('puts Undo, Redo, Save and Done in the header, as the panel has them', () => {
    const { props } = strip();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(props.onUndo).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(props.onSave).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done painting' }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it('offers Download picture, which keeps the picture as it is now on this device', () => {
    const { props } = strip();
    fireEvent.click(screen.getByRole('button', { name: 'Download picture' }));
    expect(props.onDownload).toHaveBeenCalled();
  });

  it('offers no Save with nothing to save, and says what is not saved', () => {
    strip({ unsaved: false });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(region()).not.toHaveTextContent('Not saved yet');
  });

  it('sizes every control for a finger, whatever the pointer, the pop-over open', () => {
    strip({}, { tool: 'rect' });
    fireEvent.click(screen.getByRole('button', { name: /^Colour and width/ }));
    for (const button of screen.getAllByRole('button')) {
      expect(classes(button).some((c) => c === 'size-11' || c === 'min-h-11')).toBe(true);
    }
    for (const box of [...screen.getAllByRole('checkbox'), ...screen.getAllByRole('radio')]) {
      expect(classes(box.closest('label')!)).toContain('min-h-11');
    }
    expect(classes(screen.getByLabelText('Another colour').closest('label')!)).toContain('size-11');
    expect(classes(screen.getByRole('slider', { name: 'Width' }))).toContain('h-11');
  });

  it('keeps clear of a notch on either side, and is at most as wide as a sheet', () => {
    strip();
    expect(classes(region())).toEqual(expect.arrayContaining([
      'pl-[max(1rem,env(safe-area-inset-left))]', 'pr-[max(0.5rem,env(safe-area-inset-right))]', 'mx-auto', 'w-full', 'max-w-2xl',
    ]));
  });

  it('puts the tools in the header on a short screen, a phone on its side', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === SHORT_SCREEN_QUERY, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }));
    strip();
    const heading = within(region()).getByRole('heading', { name: 'Mapmaker' });
    expect(heading.parentElement).toContainElement(row());
  });
});

describe('the colours and the width, in a pop-over', () => {
  const toggle = () => screen.getByRole('button', { name: /^Colour and width/ });

  it('names the colour and the width on its button, and opens the two colours, the palette and the width', () => {
    strip({}, { colour: '#4a3423', width: 8 });
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(toggle()).toHaveAccessibleName('Colour and width: Dark wood, 8 px');
    expect(screen.queryByRole('slider', { name: 'Width' })).toBeNull();
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    const over = screen.getByRole('group', { name: 'Colour and width' });
    expect(toggle()).toHaveAttribute('aria-controls', over.id);
    expect(within(over).getByRole('button', { name: 'Colour: Dark wood' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(over).getByRole('button', { name: /^Second colour/ })).toBeInTheDocument();
    expect(within(over).getByRole('slider', { name: 'Width' })).toHaveValue('8');
  });

  it('sets the colour chosen in the slot chosen, and closes', () => {
    const { props } = strip();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: /^Second colour/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Stone' }));
    expect(props.onSettingsChange).toHaveBeenCalledWith({ second: '#9b958a' });
    expect(screen.queryByRole('group', { name: 'Colour and width' })).toBeNull();
    // The keyboard goes back to the button that opened it, as Esc puts it.
    expect(document.activeElement).toBe(toggle());
  });

  it('sets the width, staying open', () => {
    const { props } = strip();
    fireEvent.click(toggle());
    fireEvent.change(screen.getByRole('slider', { name: 'Width' }), { target: { value: '20' } });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ width: 20 });
    expect(screen.getByRole('group', { name: 'Colour and width' })).toBeInTheDocument();
  });
});

describe('the pop-over on a phone, and by keyboard', () => {
  const toggle = () => screen.getByRole('button', { name: /^Colour and width/ });
  const over = () => screen.queryByRole('group', { name: 'Colour and width' });

  it('fits the room above the strip, scrolling within it, and lies wide on a phone on its side', () => {
    strip();
    fireEvent.click(toggle());
    const box = classes(over()!);
    // The dock is the map's size: the strip takes at most half of it, so
    // half less a margin is always free above it.
    expect(box).toEqual(expect.arrayContaining(['max-h-[calc(50cqh-1rem)]', 'overflow-y-auto']));
    expect(box).toEqual(expect.arrayContaining(['short:flex-row', 'short:w-[min(40rem,calc(100cqw-2rem))]']));
  });

  it('takes the keyboard as it opens, and Esc closes it, back on its button, and puts nothing else away', () => {
    const { props } = strip();
    fireEvent.click(toggle());
    expect(over()!).toContainElement(document.activeElement as HTMLElement);
    const kept = fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(kept).toBe(false);
    expect(over()).toBeNull();
    expect(document.activeElement).toBe(toggle());
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('closes on a press anywhere else, such as the map, and stays for a press inside it', () => {
    render(<div data-testid="map" />);
    strip();
    fireEvent.click(toggle());
    fireEvent.pointerDown(screen.getByRole('slider', { name: 'Width' }));
    expect(over()).not.toBeNull();
    fireEvent.pointerDown(screen.getByTestId('map'));
    expect(over()).toBeNull();
  });
});

describe("each tool's own settings", () => {
  it('offers a rectangle or an ellipse outlined, filled or both, and Snap to grid', () => {
    const { props } = strip({}, { tool: 'ellipse' });
    fireEvent.click(screen.getByRole('radio', { name: 'Filled' }));
    expect(props.onSettingsChange).toHaveBeenCalledWith({ style: 'fill' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Snap to grid' }));
    expect(props.onSettingsChange).toHaveBeenCalledWith({ snap: true });
    expect(screen.queryByRole('checkbox', { name: '15 degree steps' })).toBeNull();
  });

  it('offers a line 15 degree steps', () => {
    const { props } = strip({}, { tool: 'line' });
    fireEvent.click(screen.getByRole('checkbox', { name: '15 degree steps' }));
    expect(props.onSettingsChange).toHaveBeenCalledWith({ straight: true });
  });

  it('offers the fill its tolerance, on a slider a finger can take', () => {
    const { props } = strip({}, { tool: 'fill' });
    const slider = screen.getByRole('slider', { name: 'Tolerance' });
    expect(classes(slider)).toContain('h-11');
    fireEvent.change(slider, { target: { value: '30' } });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ tolerance: 30 });
  });

  it('offers the brush none', () => {
    strip({}, { tool: 'brush' });
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
  });
});

describe('a lost sign-in', () => {
  it('is said, with paint not saved', () => {
    strip({ signedOut: true });
    expect(region()).toHaveTextContent('You\'ve been signed out.');
  });
});
