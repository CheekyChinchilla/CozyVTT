/**
 * The DM tool panels keep one width whichever section is open.
 *
 * The stack had no width of its own and grew to its widest content, so the
 * Fog of War section's notes, which did not wrap, stretched it from 200 to
 * almost 400 pixels while Walls and Lights kept it at 200. The width itself
 * can only be measured in a browser; this pins the rule that sets it.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { createRef, useRef } from 'react';
import DmToolPanelContainer from '../DmToolPanelContainer';

describe('DmToolPanelContainer', () => {
  // With a height limit on the stack, the panels shrank to fit it, cutting
  // off their lower controls, where the stack should have scrolled. Each
  // keeps its own height; the stack scrolls.
  it('keeps each panel its height, so a tall stack scrolls', () => {
    const { container } = render(
      <DmToolPanelContainer containerRef={createRef<HTMLDivElement>()}>
        <p>Fog of War</p>
      </DmToolPanelContainer>
    );
    const stack = container.firstElementChild as HTMLElement;
    expect(stack.className).toMatch(/(^|\s)overflow-y-auto(\s|$)/);
    expect(stack.className).toMatch(/(^|\s)\*:shrink-0(\s|$)/);
  });

  // The handle is the stack's first child, so it scrolled away with the
  // panels and the stack could not be moved until scrolled back up.
  it('keeps the drag handle in view while the stack scrolls', () => {
    render(
      <DmToolPanelContainer containerRef={createRef<HTMLDivElement>()}>
        <p>Fog of War</p>
      </DmToolPanelContainer>
    );
    const classes = screen.getByTitle(/Drag to move the panels/).className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['sticky', 'top-0']));
  });

  // The handle was 12 pixels tall, and a finger's drag on it scrolled the
  // stack, which cancelled the drag. On a touch screen it is 24 tall and
  // takes the touch itself; jsdom evaluates no media query, so the classes
  // are what is checked.
  it('gives the drag handle room for a finger, and keeps the touch from scrolling the stack', () => {
    render(
      <DmToolPanelContainer containerRef={createRef<HTMLDivElement>()}>
        <p>Fog of War</p>
      </DmToolPanelContainer>
    );
    const classes = screen.getByTitle(/Drag to move the panels/).className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['pointer-coarse:h-6', 'touch-none']));
  });

  it('gives the panel stack one fixed width, so long notes wrap', () => {
    const { container } = render(
      <DmToolPanelContainer containerRef={createRef<HTMLDivElement>()}>
        <p>Forgets what every player has seen of this map. Their view now is unchanged.</p>
      </DmToolPanelContainer>
    );
    expect(container.firstElementChild?.className).toMatch(/(^|\s)w-\[200px\](\s|$)/);
  });
});

/** A box at `left, top` of `width` by `height`, as getBoundingClientRect gives it. */
const box = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

/**
 * The stack inside a map container at (100, 50) of 800 by 600 pixels, the
 * stack itself 200 by 300. `resize` changes the container's size.
 */
function renderInMap() {
  let mapBox = box(100, 50, 800, 600);
  function Map() {
    const ref = useRef<HTMLDivElement>(null);
    return (
      <div ref={ref} data-testid="map">
        <DmToolPanelContainer containerRef={ref}><p>Lights</p></DmToolPanelContainer>
      </div>
    );
  }
  render(<Map />);
  const map = screen.getByTestId('map');
  const stack = map.firstElementChild as HTMLElement;
  map.getBoundingClientRect = () => mapBox;
  stack.getBoundingClientRect = () => {
    const left = parseFloat(stack.style.left);
    const top = parseFloat(stack.style.top);
    return Number.isNaN(left) ? box(mapBox.right - 208, mapBox.top + 56, 200, 300) : box(mapBox.left + left, mapBox.top + top, 200, 300);
  };
  const handle = screen.getByTitle(/Drag to move the panels/);
  const drag = (dx: number, dy: number) => {
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 500 + dx, clientY: 200 + dy, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
  };
  const resize = (width: number, height: number) => {
    mapBox = box(100, 50, width, height);
    act(() => { window.dispatchEvent(new Event('resize')); });
  };
  return { stack, handle, drag, resize };
}

// A dragged stack was fixed to the window: it stayed where it was dropped
// when the map moved or shrank, and could be left outside the map with no
// way back but a reload.
describe('moving the DM tool panels', () => {
  beforeAll(() => {
    // jsdom has no pointer capture
    HTMLElement.prototype.setPointerCapture = () => {};
  });

  it('keeps a dragged stack where it was dropped on the map, not on the window', () => {
    const { stack, drag } = renderInMap();
    drag(-300, 100);
    expect(stack.style.position).toBe('absolute');
    // From (692, 106) on the page, 300 left and 100 down, is (392, 206):
    // 292 and 156 from the map's corner.
    expect(stack.style.left).toBe('292px');
    expect(stack.style.top).toBe('156px');
  });

  it('keeps the stack on the map while it is dragged', () => {
    const { stack, drag } = renderInMap();
    drag(-2000, 2000);
    expect(stack.style.left).toBe('0px');
    expect(stack.style.top).toBe('300px');
  });

  it('brings the stack back onto the map when the map shrinks', () => {
    const { stack, drag, resize } = renderInMap();
    drag(0, 250);
    resize(500, 400);
    expect(stack.style.left).toBe('300px');
    expect(stack.style.top).toBe('100px');
  });

  it('goes back to its corner on a double-click of the handle', () => {
    const { stack, handle, drag } = renderInMap();
    drag(-300, 100);
    fireEvent.doubleClick(handle);
    expect(stack.style.left).toBe('');
    expect(stack.style.right).toBe('0.5rem');
    expect(stack.style.top).toBe('3.5rem');
  });

  // The Preview Player View button sits 5rem above the map's bottom edge; a
  // tall stack ran over it and hid the Lights panel's Place button behind it.
  it('stops above the Preview Player View button', () => {
    const { stack } = renderInMap();
    // The map's height less the stack's 3.5rem from the top and 8rem kept at
    // the bottom, never under 6rem; the style engine may fold the sum.
    expect(stack.style.maxHeight.replace(/\s+/g, '')).toMatch(/^max\(6rem,(calc\()?100%-(3\.5rem-8rem|11\.5rem)\)?\)$/);
  });
});
