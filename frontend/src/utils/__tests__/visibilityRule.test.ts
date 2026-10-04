import { describe, it, expect } from 'vitest';
import { tierAt, isSeen, type Viewer, type Lit, type RulePolygon, type RulePoint } from '../visibilityRule';

// Axis-aligned rectangle polygons and a plain containment test stand in for
// the raycaster: the rule only ever asks "is this point inside".
const rect = (x1: number, y1: number, x2: number, y2: number): RulePolygon => ({
  points: [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }],
});
const inside = (p: RulePoint, poly: RulePolygon) => {
  if (poly.points.length < 3) return false;
  const xs = poly.points.map((q) => q.x);
  const ys = poly.points.map((q) => q.y);
  return p.x >= Math.min(...xs) && p.x <= Math.max(...xs) && p.y >= Math.min(...ys) && p.y <= Math.max(...ys);
};

const WHOLE = rect(0, 0, 1000, 1000);
const viewer = (over: Partial<Viewer> = {}): Viewer => ({ cx: 100, cy: 100, sight: WHOLE, darkvisionPx: 0, selfPx: 25, ...over });
const torch = (over: Partial<Lit> = {}): Lit => ({ cx: 500, cy: 500, reach: WHOLE, brightPx: 100, dimPx: 200, ...over });

describe('tierAt', () => {
  it('is dark outside every viewer\'s line of sight, however lit', () => {
    const v = viewer({ sight: rect(0, 0, 200, 200) });
    expect(tierAt({ x: 500, y: 500 }, [v], [torch()], false, inside)).toBe('dark');
    expect(tierAt({ x: 500, y: 500 }, [v], [torch()], true, inside)).toBe('dark');
    expect(tierAt({ x: 500, y: 500 }, [], [torch()], true, inside)).toBe('dark');
  });

  it('is bright everywhere in sight under global illumination', () => {
    expect(tierAt({ x: 900, y: 900 }, [viewer()], [], true, inside)).toBe('bright');
  });

  it('a viewer\'s own square is dim, with no light and no darkvision', () => {
    expect(tierAt({ x: 110, y: 110 }, [viewer()], [], false, inside)).toBe('dim');
    expect(tierAt({ x: 140, y: 100 }, [viewer()], [], false, inside)).toBe('dark');
  });

  it('darkvision shows the dark as dim, out to its radius', () => {
    const v = viewer({ darkvisionPx: 300 });
    expect(tierAt({ x: 350, y: 100 }, [v], [], false, inside)).toBe('dim');
    expect(tierAt({ x: 450, y: 100 }, [v], [], false, inside)).toBe('dark');
  });

  it('bright light is bright, dim light is dim, beyond the dim radius is dark', () => {
    expect(tierAt({ x: 550, y: 500 }, [viewer()], [torch()], false, inside)).toBe('bright');
    expect(tierAt({ x: 650, y: 500 }, [viewer()], [torch()], false, inside)).toBe('dim');
    expect(tierAt({ x: 750, y: 500 }, [viewer()], [torch()], false, inside)).toBe('dark');
  });

  it('a light reaches only where its own polygon says: not through its walls', () => {
    const lamp = torch({ reach: rect(400, 400, 600, 600) });
    expect(tierAt({ x: 650, y: 500 }, [viewer()], [lamp], false, inside)).toBe('dark');
  });

  it('two dim lights make bright, and darkvision in dim light makes bright', () => {
    const a = torch({ cx: 500, cy: 500 });
    const b = torch({ cx: 800, cy: 500 });
    expect(tierAt({ x: 650, y: 500 }, [viewer()], [a, b], false, inside)).toBe('bright');
    const dv = viewer({ darkvisionPx: 1000 });
    expect(tierAt({ x: 650, y: 500 }, [dv], [a], false, inside)).toBe('bright');
  });

  it('isSeen is anything but dark', () => {
    expect(isSeen({ x: 110, y: 110 }, [viewer()], [], false, inside)).toBe(true);
    expect(isSeen({ x: 900, y: 900 }, [viewer()], [], false, inside)).toBe(false);
  });
});
