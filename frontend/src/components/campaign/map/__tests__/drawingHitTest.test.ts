/**
 * Which drawing a tap or a click lands on, for the eraser: the topmost one
 * the point is on, its stroke within half its width and the tolerance, or
 * inside it when it is filled.
 */

import { describe, it, expect } from 'vitest';
import { drawingAt, hitTolerance } from '../drawingHitTest';
import { rememberLabelWidth } from '../drawingGeometry';
import type { Drawing } from '@/types/drawings';

let made = 0;
function drawing(extra: Partial<Drawing> = {}): Drawing {
  made += 1;
  return {
    id: `d${made}`, authorId: 'me', audience: 'ALL', layer: 'MARKUP', kind: 'line', color: '#d94f3d', fillColor: null,
    width: 4, rotation: 0, sortKey: 0, points: [[100, 100], [300, 100]], text: null, createdAt: '2026-10-27T10:00:00.000Z',
    ...extra,
  };
}

const at = (x: number, y: number) => ({ x, y });

describe('a stroke', () => {
  it('is hit within half its width and the tolerance of its line, and missed past them', () => {
    const line = drawing({ width: 10 });

    expect(drawingAt(at(200, 104), [line], 0)).toBe(line);
    expect(drawingAt(at(200, 108), [line], 0)).toBeNull();
    expect(drawingAt(at(200, 108), [line], 4)).toBe(line);
    expect(drawingAt(at(320, 100), [line], 4)).toBeNull();
  });

  it('is hit along every part of a pen stroke', () => {
    const pen = drawing({ kind: 'pen', points: [[0, 0], [100, 0], [100, 100]] });

    expect(drawingAt(at(100, 60), [pen], 2)).toBe(pen);
    expect(drawingAt(at(50, 50), [pen], 2)).toBeNull();
  });

  it('is hit on an arrow’s head as well as its shaft', () => {
    const arrow = drawing({ kind: 'arrow', points: [[0, 100], [200, 100]], width: 4 });

    // The head is 16 long and about 18 wide at its base, at x 184.
    expect(drawingAt(at(186, 107), [arrow], 0)).toBe(arrow);
    expect(drawingAt(at(100, 107), [arrow], 0)).toBeNull();
  });
});

describe('a shape', () => {
  it('is hit on its outline only, unfilled', () => {
    const rect = drawing({ kind: 'rect', points: [[100, 100], [300, 200]] });

    expect(drawingAt(at(100, 150), [rect], 2)).toBe(rect);
    expect(drawingAt(at(200, 199), [rect], 2)).toBe(rect);
    expect(drawingAt(at(200, 150), [rect], 2)).toBeNull();
  });

  it('is hit anywhere inside, filled', () => {
    const rect = drawing({ kind: 'rect', points: [[100, 100], [300, 200]], fillColor: '#4caf6e' });

    expect(drawingAt(at(200, 150), [rect], 2)).toBe(rect);
    expect(drawingAt(at(350, 150), [rect], 2)).toBeNull();
  });

  it('is hit on an ellipse’s curve, and inside it when filled', () => {
    const ring = drawing({ kind: 'ellipse', points: [[100, 100], [300, 200]] });
    const disc = drawing({ kind: 'ellipse', points: [[100, 100], [300, 200]], fillColor: '#4caf6e' });

    expect(drawingAt(at(300, 150), [ring], 2)).toBe(ring);
    expect(drawingAt(at(200, 100), [ring], 2)).toBe(ring);
    expect(drawingAt(at(200, 150), [ring], 2)).toBeNull();
    // A corner of the box is outside the curve.
    expect(drawingAt(at(110, 110), [disc], 2)).toBeNull();
    expect(drawingAt(at(200, 150), [disc], 2)).toBe(disc);
  });

  it('is hit on a polygon’s closing side, and inside it when filled', () => {
    const tri = drawing({ kind: 'polygon', points: [[0, 0], [200, 0], [100, 200]] });
    const filled = drawing({ kind: 'polygon', points: [[0, 0], [200, 0], [100, 200]], fillColor: '#8e5bd9' });

    expect(drawingAt(at(50, 100), [tri], 2)).toBe(tri);
    expect(drawingAt(at(100, 60), [tri], 2)).toBeNull();
    expect(drawingAt(at(100, 60), [filled], 2)).toBe(filled);
    expect(drawingAt(at(10, 150), [filled], 2)).toBeNull();
  });

  it('is found where it is drawn once turned', () => {
    // A rectangle 200 wide and 20 tall about (200, 100), turned upright.
    const bar = drawing({ kind: 'rect', points: [[100, 90], [300, 110]], fillColor: '#4caf6e', rotation: 90 });

    expect(drawingAt(at(200, 20), [bar], 0)).toBe(bar);
    expect(drawingAt(at(280, 100), [bar], 0)).toBeNull();
  });
});

describe('a label', () => {
  it('is hit inside the box its words take from its point', () => {
    const label = drawing({ kind: 'text', points: [[100, 100]], width: 5, text: 'Ambush' });

    expect(drawingAt(at(110, 110), [label], 0)).toBe(label);
    expect(drawingAt(at(100, 80), [label], 0)).toBeNull();
  });

  // The layer measures each label as it draws it; the eraser then finds it
  // by the width drawn, which for wide characters is far more than a Latin
  // letter's guess, and for narrow ones less.
  it('is hit along the width the layer measured it at', () => {
    const wide = drawing({ kind: 'text', points: [[100, 100]], width: 4, text: '北口で待ち合わせ' });
    const narrow = drawing({ kind: 'text', points: [[100, 200]], width: 4, text: 'iiiiiiii' });
    rememberLabelWidth(wide, 128);
    rememberLabelWidth(narrow, 30);

    expect(drawingAt(at(220, 108), [wide], 0)).toBe(wide);
    expect(drawingAt(at(160, 208), [narrow], 0)).toBeNull();
  });

  it('is hit along a letter-height for each character before it has been drawn', () => {
    const unmeasured = drawing({ kind: 'text', points: [[100, 100]], width: 4, text: '北口で待ち合わせ' });

    expect(drawingAt(at(220, 108), [unmeasured], 0)).toBe(unmeasured);
  });
});

describe('several drawings', () => {
  it('gives the topmost the point is on, the last drawn', () => {
    const under = drawing({ kind: 'rect', points: [[0, 0], [400, 400]], fillColor: '#111111' });
    const over = drawing({ kind: 'line', points: [[0, 200], [400, 200]] });

    expect(drawingAt(at(200, 200), [under, over], 2)).toBe(over);
    expect(drawingAt(at(200, 100), [under, over], 2)).toBe(under);
  });

  it('never gives a drawing of a kind it does not know', () => {
    expect(drawingAt(at(10, 10), [drawing({ kind: 'stamp', points: [[10, 10]] })], 20)).toBeNull();
  });
});

describe('the tolerance', () => {
  it('is wider for a finger than for a mouse or a pen, and the same on screen at any zoom', () => {
    expect(hitTolerance('touch', 1)).toBeGreaterThan(hitTolerance('mouse', 1));
    expect(hitTolerance('pen', 1)).toBe(hitTolerance('mouse', 1));
    expect(hitTolerance('touch', 2) * 2).toBeCloseTo(hitTolerance('touch', 1));
  });
});
