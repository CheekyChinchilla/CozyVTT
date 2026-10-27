/**
 * The drawing tools' panel on its own: what it offers whom, the controls'
 * size for a finger, and that it fits whatever holds it. jsdom lays nothing
 * out, so the fit is checked as the classes that make it: the panel takes
 * its holder's width and its rows of buttons wrap.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DrawControls, { type DrawControlsProps } from '../DrawControls';
import { DEFAULT_DRAW_SETTINGS } from '../map/tools/useDrawTool';

function panel(extra: Partial<DrawControlsProps> = {}) {
  const props: DrawControlsProps = {
    kind: 'pen', onKindChange: vi.fn(), settings: DEFAULT_DRAW_SETTINGS, onSettingsChange: vi.fn(), isDM: false,
    polygonCorners: 0, onPolygonDone: vi.fn(), onPolygonCancel: vi.fn(), clearable: 2, onClear: vi.fn(), onClose: vi.fn(),
    ...extra,
  };
  render(<DrawControls {...props} />);
  return props;
}

const classes = (el: Element) => el.className.split(/\s+/);

describe('the drawing tools', () => {
  it('offers the nine tools, the one in use pressed', () => {
    const props = panel({ kind: 'arrow' });

    const names = ['Pen', 'Line', 'Arrow', 'Rectangle', 'Ellipse', 'Polygon', 'Text label', 'Eraser', 'Laser pointer'];
    for (const name of names) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', name === 'Arrow' ? 'true' : 'false');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Ellipse' }));
    expect(props.onKindChange).toHaveBeenCalledWith('ellipse');
  });

  it('offers the eight colours by name and another, and sets the one chosen', () => {
    const props = panel();

    fireEvent.click(screen.getByRole('button', { name: 'Green' }));
    expect(props.onSettingsChange).toHaveBeenCalledWith({ color: '#4caf6e' });
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('Another colour'), { target: { value: '#123456' } });
    expect(props.onSettingsChange).toHaveBeenCalledWith({ color: '#123456' });
  });

  it('offers Fill shapes for the closed shapes only, and Snap to grid for every shape', () => {
    panel({ kind: 'line' });
    expect(screen.getByRole('checkbox', { name: 'Snap to grid' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Fill shapes' })).not.toBeInTheDocument();
  });

  it('offers neither on the pen', () => {
    panel({ kind: 'pen' });
    expect(screen.queryByRole('checkbox', { name: 'Snap to grid' })).not.toBeInTheDocument();
  });

  it('offers a polygon’s Done once it has three corners, and Cancel', () => {
    const props = panel({ kind: 'polygon', polygonCorners: 2 });
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onPolygonCancel).toHaveBeenCalled();
  });
});

describe('who is offered what', () => {
  it('gives a player Clear mine, at once, and no Only I can see this', () => {
    const props = panel({ isDM: false });

    expect(screen.queryByRole('checkbox', { name: 'Only I can see this' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear mine' }));
    expect(props.onClear).toHaveBeenCalled();
  });

  it('turns Clear mine off with nothing to clear', () => {
    panel({ clearable: 0 });
    expect(screen.getByRole('button', { name: 'Clear mine' })).toBeDisabled();
  });

  // The laser pointer goes to everyone, so a box ticked for a secret note
  // must not seem to keep it to the DM.
  it('offers the DM no Only I can see this under the laser pointer, and says everyone sees it', () => {
    panel({ isDM: true, kind: 'laser', settings: { ...DEFAULT_DRAW_SETTINGS, dmOnly: true } });

    expect(screen.queryByRole('checkbox', { name: 'Only I can see this' })).not.toBeInTheDocument();
    expect(screen.getByText('Everyone sees the laser pointer.')).toBeInTheDocument();
  });

  it('gives the DM Only I can see this, and Clear drawings, which asks first and says how many', () => {
    const props = panel({ isDM: true, clearable: 3 });

    expect(screen.getByRole('checkbox', { name: 'Only I can see this' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear drawings' }));
    expect(props.onClear).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('3 drawings');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear drawings' }));
    expect(props.onClear).toHaveBeenCalled();
  });
});

describe('the panel’s fit', () => {
  // It sits in the DM's 200-pixel tool stack, a player's corner and, on a
  // phone, a sheet: it takes the width it is given and wraps its rows.
  it('takes its holder’s width and wraps its rows of buttons', () => {
    panel({ isDM: true });

    const section = screen.getByRole('region', { name: 'Drawing tools' });
    expect(classes(section)).toContain('w-full');
    expect(classes(screen.getByRole('button', { name: 'Pen' }).parentElement!)).toContain('flex-wrap');
    expect(classes(screen.getByRole('button', { name: 'Red' }).parentElement!)).toContain('flex-wrap');
    expect(section.className).not.toMatch(/\b(min-)?w-\[|\bw-(9[6-9]|\d{3,})\b/);
  });

  it('sizes every control for a finger', () => {
    panel({ isDM: true, kind: 'rect' });

    for (const button of screen.getAllByRole('button')) expect(classes(button)).toContain('touch-target');
    for (const box of screen.getAllByRole('checkbox')) expect(classes(box.closest('label')!)).toContain('touch-target');
  });
});
