/**
 * The band across the top of the map, the toolbar and the spirit realm label,
 * and where the panels under it go.
 *
 * With a mouse the toolbar is one row of 34-pixel buttons, and the AoE panel,
 * the Put back bar and the DM's tool stack keep the places they have always
 * had. A touch screen's 44-pixel buttons make the toolbar taller, and a
 * narrow map wraps it onto a second row: the panels then start under the
 * band's bottom edge.
 */

import { describe, it, expect } from 'vitest';
import { measureTopBand, measureBottom, underBand, stackCornerTop, BAND_GAP, type TopBand } from '../toolbarLayout';

/** A box at `left, top` of `width` by `height`, as getBoundingClientRect gives it. */
const box = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

function el(rect: DOMRect, ...children: HTMLElement[]): HTMLElement {
  const node = document.createElement('div');
  node.getBoundingClientRect = () => rect;
  for (const child of children) node.appendChild(child);
  return node;
}

/**
 * A map container at (100, 50), 600 wide, with the band 16 pixels in from
 * its top left corner. The toolbar's groups are given as boxes in the
 * container's own coordinates.
 */
function band(groups: Array<[number, number, number, number]>, label?: [number, number, number, number]) {
  const at = ([l, t, w, h]: [number, number, number, number]) => box(100 + l, 50 + t, w, h);
  const toolbarBox = groups.reduce(
    (r, g) => ({ right: Math.max(r.right, g[0] + g[2] + 9), bottom: Math.max(r.bottom, g[1] + g[3] + 9) }),
    { right: 0, bottom: 0 },
  );
  const toolbar = el(box(116, 66, toolbarBox.right - 16, toolbarBox.bottom - 16), ...groups.map((g) => el(at(g))));
  const parts = [toolbar];
  if (label) parts.push(el(at(label)));
  const bottom = Math.max(toolbarBox.bottom, label ? label[1] + label[3] : 0);
  const bandEl = el(box(116, 66, 584, bottom - 16), ...parts);
  const container = el(box(100, 50, 600, 500), bandEl);
  return { bandEl, toolbar, container };
}

describe('measureTopBand', () => {
  it('reads one row of a mouse’s buttons: bottom 68, nothing wrapped', () => {
    const { bandEl, toolbar, container } = band([[25, 25, 152, 34], [185, 25, 129, 34]]);

    expect(measureTopBand(bandEl, toolbar, container)).toEqual({ bottom: 68, buttonsRight: 314, width: 600, wrapped: false });
  });

  it('sees a second row of buttons', () => {
    const { bandEl, toolbar, container } = band([[25, 25, 168, 44], [201, 25, 157, 44], [25, 77, 157, 44]]);

    expect(measureTopBand(bandEl, toolbar, container)).toEqual({ bottom: 130, buttonsRight: 358, width: 600, wrapped: true });
  });

  it('sees the spirit realm label beside the toolbar, and under it', () => {
    const beside = band([[25, 25, 152, 34]], [480, 16, 104, 28]);
    expect(measureTopBand(beside.bandEl, beside.toolbar, beside.container)?.wrapped).toBe(false);

    const under = band([[25, 25, 152, 34]], [480, 76, 104, 28]);
    expect(measureTopBand(under.bandEl, under.toolbar, under.container)).toEqual({ bottom: 104, buttonsRight: 177, width: 600, wrapped: true });
  });

  // jsdom, or a page not laid out yet: nothing to place anything from.
  it('gives nothing while the band has no size', () => {
    const toolbar = el(box(0, 0, 0, 0), el(box(0, 0, 0, 0)));
    const bandEl = el(box(0, 0, 0, 0), toolbar);
    expect(measureTopBand(bandEl, toolbar, el(box(0, 0, 0, 0), bandEl))).toBeNull();
  });
});

// The Put back bar's foot, which the AoE panel starts under while both show.
describe('measureBottom', () => {
  it('reads a panel’s bottom edge from the map’s top', () => {
    const bar = el(box(183, 168, 254, 62));
    expect(measureBottom(bar, el(box(100, 50, 600, 500), bar))).toBe(180);
  });

  it('gives nothing while the panel has no size', () => {
    const bar = el(box(0, 0, 0, 0));
    expect(measureBottom(bar, el(box(0, 0, 0, 0), bar))).toBeNull();
  });
});

const oneRow: TopBand = { bottom: 68, buttonsRight: 503, width: 754, wrapped: false };

describe('underBand: the AoE panel and the Put back bar', () => {
  it('leaves them in their places under one row of a mouse’s buttons', () => {
    expect(underBand(oneRow, false)).toBeNull();
    expect(underBand(null, false)).toBeNull();
    expect(underBand(null, true)).toBeNull();
  });

  it('starts them under the band on a touch screen, whose buttons are taller', () => {
    expect(underBand({ ...oneRow, bottom: 78 }, true)).toBe(78 + BAND_GAP);
  });

  it('starts them under the band when it wraps', () => {
    expect(underBand({ ...oneRow, bottom: 110, wrapped: true }, false)).toBe(110 + BAND_GAP);
  });
});

describe('stackCornerTop: the DM tool stack in its corner', () => {
  // The stack is 200 wide, 8 in from the right: its left edge at 546 on a
  // map 754 wide.
  it('stays beside a toolbar whose buttons end before it', () => {
    expect(stackCornerTop(oneRow, 200, 8)).toBeNull();
    expect(stackCornerTop({ ...oneRow, buttonsRight: 546 }, 200, 8)).toBeNull();
    expect(stackCornerTop(null, 200, 8)).toBeNull();
  });

  it('starts under the band when the buttons reach under its corner', () => {
    expect(stackCornerTop({ ...oneRow, buttonsRight: 547 }, 200, 8)).toBe(68 + BAND_GAP);
  });

  it('starts under the band when it wraps', () => {
    expect(stackCornerTop({ ...oneRow, bottom: 130, wrapped: true }, 200, 8)).toBe(130 + BAND_GAP);
  });
});
