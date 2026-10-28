/**
 * The drawing layer: drawings and the previews of strokes on their way,
 * drawn into a context that records each call with the style in force when
 * it was made. What is checked is what is drawn, where, in which order and
 * with which look, not pixels.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  drawDrawings, drawDrawingPreviews, drawMarkupLayer, createDrawingCache, previewOpacity, laserPointOpacity,
  type ActivePreview, type DrawingsDrawState,
} from '../layers/drawDrawings';
import { watchLabelFonts } from '../drawingGeometry';
import { recordDrawing } from '@/test/recordingCanvas';
import { DRAWING_LIMITS } from '@/constants/drawingLimits';
import type { Viewport } from '../layers/types';
import type { Drawing } from '@/types/drawings';

interface Call {
  method: string;
  args: unknown[];
  strokeStyle: unknown;
  fillStyle: unknown;
  globalAlpha: number;
  lineWidth: unknown;
  font: unknown;
  dash: number[];
}

/** A context recording its calls; `measure` is the width a text is measured at (10 a character unless given). */
function recorder(measure: (text: string) => number = (text) => text.length * 10) {
  const calls: Call[] = [];
  const props: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1 };
  let dash: number[] = [];
  const stack: Array<{ props: Record<string, unknown>; dash: number[] }> = [];
  const ctx = new Proxy(props, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        if (prop === 'setLineDash') dash = [...(args[0] as number[])];
        if (prop === 'save') stack.push({ props: { ...props }, dash });
        if (prop === 'restore') {
          const top = stack.pop();
          if (top) { Object.assign(props, top.props); dash = top.dash; }
        }
        calls.push({
          method: prop, args,
          strokeStyle: props.strokeStyle, fillStyle: props.fillStyle, globalAlpha: Number(props.globalAlpha),
          lineWidth: props.lineWidth, font: props.font, dash,
        });
        if (prop === 'measureText') return { width: measure(String(args[0])) };
        return undefined;
      };
    },
    set(target, prop, value) {
      if (typeof prop === 'string') target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const viewport: Viewport = { zoom: 1, panOffset: { x: 0, y: 0 }, gridSize: 50, mapWidth: 20, mapHeight: 20 };

let made = 0;
function drawing(extra: Partial<Drawing> = {}): Drawing {
  made += 1;
  return {
    id: `d${made}`, authorId: 'me', audience: 'ALL', layer: 'MARKUP', kind: 'line', color: '#d94f3d', fillColor: null,
    width: 4, rotation: 0, sortKey: 0, points: [[100, 100], [200, 100]], text: null,
    createdAt: `2026-10-27T10:00:${String(made % 60).padStart(2, '0')}.000Z`,
    ...extra,
  };
}

function draw(drawings: Drawing[], extra: Partial<DrawingsDrawState> = {}) {
  const { ctx, calls } = recorder();
  drawDrawings(ctx, { drawings, layer: 'MARKUP', showDmOnly: true, ...extra }, viewport);
  return calls;
}

const named = (calls: Call[], method: string) => calls.filter((c) => c.method === method);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('each kind of drawing', () => {
  it('draws a pen stroke through its points in its colour and width, with round ends', () => {
    const calls = draw([drawing({ kind: 'pen', points: [[10, 10], [20, 30], [40, 35]], width: 6, color: '#3d8bd9' })]);

    expect(named(calls, 'moveTo').map((c) => c.args)).toEqual([[10, 10]]);
    expect(named(calls, 'lineTo').map((c) => c.args)).toEqual([[20, 30], [40, 35]]);
    const stroke = named(calls, 'stroke');
    expect(stroke).toHaveLength(1);
    expect(stroke[0]).toMatchObject({ strokeStyle: '#3d8bd9', lineWidth: 6, globalAlpha: 1, dash: [] });
  });

  it('draws a line from its first point to its second', () => {
    const calls = draw([drawing({ kind: 'line', points: [[0, 0], [90, 40]] })]);

    expect(named(calls, 'moveTo').map((c) => c.args)).toEqual([[0, 0]]);
    expect(named(calls, 'lineTo').map((c) => c.args)).toEqual([[90, 40]]);
    expect(named(calls, 'stroke')).toHaveLength(1);
    expect(named(calls, 'fill')).toHaveLength(0);
  });

  it('draws an arrow with a filled head at its second point, sized by its width', () => {
    const head = (width: number) => {
      const calls = draw([drawing({ kind: 'arrow', points: [[0, 100], [300, 100]], width })]);
      const fill = named(calls, 'fill');
      expect(fill).toHaveLength(1);
      expect(fill[0].fillStyle).toBe('#d94f3d');
      // The head's corners are the two lineTo calls after the shaft's.
      const corners = named(calls, 'lineTo').slice(1).map((c) => c.args as [number, number]);
      return { tip: named(calls, 'moveTo')[1].args, length: 300 - corners[0][0], span: Math.abs(corners[0][1] - corners[1][1]) };
    };

    const thin = head(2);
    const thick = head(10);
    expect(thin.tip).toEqual([300, 100]);
    expect(thin.length).toBe(12);
    expect(thick.length).toBe(40);
    expect(thick.span).toBeGreaterThan(thin.span);
  });

  it('draws a rectangle between its two corners, filled when it has a fill', () => {
    const calls = draw([drawing({ kind: 'rect', points: [[200, 150], [100, 50]], fillColor: '#4caf6e' })]);

    expect(named(calls, 'rect').map((c) => c.args)).toEqual([[100, 50, 100, 100]]);
    const fill = named(calls, 'fill');
    expect(fill).toHaveLength(1);
    expect(fill[0].fillStyle).toBe('#4caf6e');
    expect(fill[0].globalAlpha).toBeLessThan(0.5);
    expect(named(calls, 'stroke')).toHaveLength(1);
  });

  it('draws an ellipse inside the box of its two corners', () => {
    const calls = draw([drawing({ kind: 'ellipse', points: [[100, 100], [300, 200]] })]);

    expect(named(calls, 'ellipse').map((c) => c.args)).toEqual([[200, 150, 100, 50, 0, 0, Math.PI * 2]]);
    expect(named(calls, 'fill')).toHaveLength(0);
  });

  it('draws a polygon closed, through every corner', () => {
    const calls = draw([drawing({ kind: 'polygon', points: [[0, 0], [100, 0], [50, 80]], fillColor: '#8e5bd9' })]);

    expect(named(calls, 'moveTo').map((c) => c.args)).toEqual([[0, 0]]);
    expect(named(calls, 'lineTo').map((c) => c.args)).toEqual([[100, 0], [50, 80]]);
    expect(named(calls, 'closePath')).toHaveLength(1);
    expect(named(calls, 'fill')).toHaveLength(1);
  });

  it('writes a label from its point, its letters four times its width tall, and keeps it to its box', () => {
    const calls = draw([drawing({ kind: 'text', points: [[40, 60]], width: 5, text: 'Ambush here', color: '#e5d94a' })]);

    const text = named(calls, 'fillText');
    expect(text).toHaveLength(1);
    expect(text[0].args.slice(0, 3)).toEqual(['Ambush here', 40, 60]);
    expect(text[0].font).toContain('20px');
    expect(text[0].fillStyle).toBe('#e5d94a');
    // Clipped first, so a label of stacked marks paints no further than its own lines.
    const clip = calls.findIndex((c) => c.method === 'clip');
    expect(clip).toBeGreaterThan(-1);
    expect(clip).toBeLessThan(calls.indexOf(text[0]));
  });

  it('turns a drawing by its rotation about the middle of its points', () => {
    const calls = draw([drawing({ kind: 'rect', points: [[100, 100], [200, 300]], rotation: 90 })]);

    expect(named(calls, 'translate').map((c) => c.args)).toContainEqual([150, 200]);
    expect(named(calls, 'rotate').map((c) => c.args)).toEqual([[Math.PI / 2]]);
  });

  // The server takes only these kinds; one a later release adds is not drawn
  // as something it is not.
  it('draws nothing for a kind it does not know', () => {
    const calls = draw([drawing({ kind: 'stamp', points: [[10, 10]] })]);

    expect(calls.filter((c) => ['stroke', 'fill', 'fillText'].includes(c.method))).toEqual([]);
  });
});

describe('the order and the layer', () => {
  it('draws the drawings in the order it is given them, one over the next', () => {
    const calls = draw([drawing({ color: '#111111' }), drawing({ color: '#222222' }), drawing({ color: '#333333' })]);

    expect(named(calls, 'stroke').map((c) => c.strokeStyle)).toEqual(['#111111', '#222222', '#333333']);
  });

  it('draws only the layer it is asked for', () => {
    const calls = draw([drawing({ layer: 'GROUND', color: '#111111' }), drawing({ color: '#222222' })]);

    expect(named(calls, 'stroke').map((c) => c.strokeStyle)).toEqual(['#222222']);
  });
});

describe('a drawing for the DM alone', () => {
  it('is dashed and faded in the DM’s own view, so the DM can tell what the table does not see', () => {
    const calls = draw([drawing({ audience: 'DM', color: '#111111' }), drawing({ color: '#222222' })]);

    const [secret, open] = named(calls, 'stroke');
    expect(secret.dash.length).toBeGreaterThan(0);
    expect(secret.globalAlpha).toBeLessThan(1);
    expect(open.dash).toEqual([]);
    expect(open.globalAlpha).toBe(1);
  });

  it('marks a label for the DM alone with a dashed box round it', () => {
    const calls = draw([drawing({ kind: 'text', audience: 'DM', points: [[0, 0]], text: 'Trap' })]);

    expect(named(calls, 'strokeRect').some((c) => c.dash.length > 0)).toBe(true);
  });

  // Player Preview draws what a player is sent, which never holds one.
  it('is not drawn at all outside the DM’s own view', () => {
    const calls = draw([drawing({ audience: 'DM', kind: 'text', points: [[0, 0]], text: 'Secret' }), drawing({ audience: 'DM' })], { showDmOnly: false });

    expect(calls.filter((c) => ['stroke', 'fill', 'fillText', 'strokeRect'].includes(c.method))).toEqual([]);
  });
});

describe('the drawing cache', () => {
  /** A Path2D that records what it is given; jsdom has none. */
  class FakePath {
    static made = 0;
    ops: unknown[][] = [];
    constructor() { FakePath.made += 1; }
    moveTo(...a: unknown[]) { this.ops.push(['moveTo', ...a]); }
    lineTo(...a: unknown[]) { this.ops.push(['lineTo', ...a]); }
    closePath() { this.ops.push(['closePath']); }
    rect(...a: unknown[]) { this.ops.push(['rect', ...a]); }
    ellipse(...a: unknown[]) { this.ops.push(['ellipse', ...a]); }
  }

  it('traces each drawing once and strokes the same path on every repaint, as a pan makes', () => {
    FakePath.made = 0;
    vi.stubGlobal('Path2D', FakePath);
    const cache = createDrawingCache();
    const drawings = [drawing({ kind: 'pen', points: [[0, 0], [10, 10], [20, 0]] }), drawing({ kind: 'arrow' })];

    const first = recorder();
    drawDrawings(first.ctx, { drawings, layer: 'MARKUP', showDmOnly: true, cache }, viewport);
    const traced = FakePath.made;
    const second = recorder();
    drawDrawings(second.ctx, { drawings, layer: 'MARKUP', showDmOnly: true, cache }, { ...viewport, panOffset: { x: 300, y: -40 } });

    expect(traced).toBe(3); // the stroke, the arrow's shaft and its head
    expect(FakePath.made).toBe(traced);
    const paths = (calls: Call[]) => calls.filter((c) => c.method === 'stroke' || c.method === 'fill').map((c) => c.args[0]);
    expect(paths(second.calls)).toEqual(paths(first.calls));
    expect(paths(first.calls).every((p) => p instanceof FakePath)).toBe(true);
    // Traced into the path, nothing is traced into the context.
    expect(named(second.calls, 'lineTo')).toEqual([]);
  });

  it('traces a drawing that changed again', () => {
    FakePath.made = 0;
    vi.stubGlobal('Path2D', FakePath);
    const cache = createDrawingCache();
    const before = drawing({ kind: 'line' });

    drawDrawings(recorder().ctx, { drawings: [before], layer: 'MARKUP', showDmOnly: true, cache }, viewport);
    drawDrawings(recorder().ctx, { drawings: [{ ...before, points: [[0, 0], [5, 5]] }], layer: 'MARKUP', showDmOnly: true, cache }, viewport);

    expect(FakePath.made).toBe(2);
  });
});

describe('the part of the map on screen', () => {
  const visibleFrom = (minX: number) => ({ minX, minY: 0, maxX: 600, maxY: 400 });
  const labelDrawn = (calls: Call[]) => named(calls, 'fillText').length > 0;

  // A label of wide characters reaches about one letter-height a character,
  // past what a guess at a Latin letter's width gives it.
  it('keeps a label of wide characters drawn while only its end is on screen, by its measured width', () => {
    const label = drawing({ kind: 'text', points: [[100, 100]], width: 4, text: '北口で待ち合わせ' });
    const { ctx, calls } = recorder((text) => [...text].length * 16);

    drawDrawings(ctx, { drawings: [label], layer: 'MARKUP', showDmOnly: true, visible: visibleFrom(200), cache: createDrawingCache() }, viewport);

    expect(labelDrawn(calls)).toBe(true);
  });

  it('skips a label whose measured end lies before the screen, however many letters it has', () => {
    const label = drawing({ kind: 'text', points: [[100, 100]], width: 4, text: 'iiiiiiii' });
    const { ctx, calls } = recorder((text) => text.length * 4);

    drawDrawings(ctx, { drawings: [label], layer: 'MARKUP', showDmOnly: true, visible: visibleFrom(170), cache: createDrawingCache() }, viewport);

    expect(labelDrawn(calls)).toBe(false);
  });

  // Measuring sets the font and asks the browser, which a pan of 2,000
  // labels would do 2,000 times a frame: once a label is enough.
  it('measures a label once, and draws it again by that width', () => {
    const label = drawing({ kind: 'text', points: [[100, 100]], width: 4, text: 'Gate' });
    const cache = createDrawingCache();

    const first = recorder();
    drawDrawings(first.ctx, { drawings: [label], layer: 'MARKUP', showDmOnly: true, cache }, viewport);
    const second = recorder();
    drawDrawings(second.ctx, { drawings: [label], layer: 'MARKUP', showDmOnly: true, cache }, { ...viewport, panOffset: { x: 40, y: 0 } });

    expect(named(first.calls, 'measureText')).toHaveLength(1);
    expect(named(second.calls, 'measureText')).toHaveLength(0);
    expect(named(second.calls, 'fillText')).toHaveLength(1);
  });

  // A label drawn before its font has loaded is measured in the fallback
  // font, and its box would cut the end off a wider one: once a font loads,
  // every label is measured again as it is next drawn.
  it('measures a label again once a font has loaded, and says so', () => {
    const fonts = new EventTarget();
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    const loaded = vi.fn();
    const stop = watchLabelFonts(loaded);
    try {
      const label = drawing({ kind: 'text', points: [[100, 100]], width: 4, text: 'Gate' });
      const cache = createDrawingCache();
      const fallback = recorder((text) => text.length * 10);
      drawDrawings(fallback.ctx, { drawings: [label], layer: 'MARKUP', showDmOnly: true, cache }, viewport);

      fonts.dispatchEvent(new Event('loadingdone'));
      const inter = recorder((text) => text.length * 20);
      drawDrawings(inter.ctx, { drawings: [label], layer: 'MARKUP', showDmOnly: true, cache }, viewport);

      expect(loaded).toHaveBeenCalledTimes(1);
      expect(named(inter.calls, 'measureText')).toHaveLength(1);
      // The clip is the measured width and a letter-height each side.
      expect(named(inter.calls, 'rect')[0].args[2]).toBe(80 + 16 * 2);
    } finally {
      stop();
      Reflect.deleteProperty(document, 'fonts');
    }
  });

  it('skips a drawing wholly outside it, and draws one reaching into it', () => {
    const outside = drawing({ color: '#111111', points: [[2000, 2000], [2100, 2000]] });
    const reaching = drawing({ color: '#222222', points: [[-50, 10], [5, 10]] });

    const calls = draw([outside, reaching], { visible: { minX: 0, minY: 0, maxX: 500, maxY: 400 } });

    expect(named(calls, 'stroke').map((c) => c.strokeStyle)).toEqual(['#222222']);
  });

  it('keeps a stroke whose width reaches into it though its points lie outside', () => {
    const calls = draw([drawing({ width: 40, points: [[-15, 10], [-15, 90]] })], { visible: { minX: 0, minY: 0, maxX: 500, maxY: 400 } });

    expect(named(calls, 'stroke')).toHaveLength(1);
  });
});

// The overlay repaints for every ping, laser frame, stroke on its way and
// token move, and the stored drawings change far less often: their pixels
// are kept, drawn again only when what they show changes, and copied on.
describe('the markup layer', () => {
  const drawn = recordDrawing();

  /** The overlay's context, on a canvas of its own, and the canvas the markup is kept on once there is one. */
  function overlay(width = 800, height = 600) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no context');
    return { ctx, kept: () => [...drawn.recorded.keys()].find((c) => c !== canvas) };
  }
  const strokes = (canvas: HTMLCanvasElement | undefined) => (canvas ? drawn.take(canvas).filter((c) => c.method === 'stroke').length : 0);
  const copies = (ctx: CanvasRenderingContext2D, of: HTMLCanvasElement | undefined) =>
    drawn.take(ctx.canvas).filter((c) => c.method === 'drawImage' && c.args[0] === of).length;

  it('draws the drawings once, and copies them on while nothing they show changes', () => {
    const { ctx, kept } = overlay();
    const state = { drawings: [drawing()], showDmOnly: true, visible: null, cache: createDrawingCache() };

    drawMarkupLayer(ctx, state, viewport);
    drawMarkupLayer(ctx, state, viewport);
    drawMarkupLayer(ctx, state, viewport);

    expect(strokes(kept())).toBe(1);
    expect(copies(ctx, kept())).toBe(3);
  });

  it('draws them again when the drawings, the view, the canvas or whose view it is change', () => {
    const { ctx, kept } = overlay();
    const cache = createDrawingCache();
    const state = { drawings: [drawing()], showDmOnly: true, visible: null, cache };
    drawMarkupLayer(ctx, state, viewport);
    strokes(kept());

    const more = { ...state, drawings: [...state.drawings, drawing({ points: [[5, 5], [60, 60]] })] };
    drawMarkupLayer(ctx, more, viewport);
    expect(strokes(kept())).toBe(2);
    drawMarkupLayer(ctx, more, { ...viewport, zoom: 2 });
    expect(strokes(kept())).toBe(2);
    drawMarkupLayer(ctx, more, { ...viewport, zoom: 2, panOffset: { x: 30, y: 0 } });
    expect(strokes(kept())).toBe(2);
    drawMarkupLayer(ctx, { ...more, showDmOnly: false }, { ...viewport, zoom: 2, panOffset: { x: 30, y: 0 } });
    expect(strokes(kept())).toBe(2);
    ctx.canvas.width = 1024;
    drawMarkupLayer(ctx, { ...more, showDmOnly: false }, { ...viewport, zoom: 2, panOffset: { x: 30, y: 0 } });
    expect(strokes(kept())).toBe(2);
  });

  it('copies nothing onto a map with no drawings', () => {
    const { ctx } = overlay();

    drawMarkupLayer(ctx, { drawings: [], showDmOnly: true, visible: null, cache: createDrawingCache() }, viewport);

    expect(drawn.take(ctx.canvas).filter((c) => c.method === 'drawImage')).toEqual([]);
  });
});

function preview(extra: Partial<ActivePreview> = {}): ActivePreview {
  return {
    key: 'them:p1', kind: 'pen', color: '#3d8bd9', width: 4, audience: 'ALL', laser: false,
    points: [[0, 0], [50, 50], [90, 40]], times: [0, 0, 0], lastAt: 0, ...extra,
  };
}

function drawPreviews(previews: ActivePreview[], now: number, extra: { reducedMotion?: boolean; showDmOnly?: boolean; laser?: boolean } = {}) {
  const { ctx, calls } = recorder();
  drawDrawingPreviews(ctx, { previews, now, reducedMotion: false, showDmOnly: true, laser: false, ...extra }, viewport);
  return calls;
}

const TTL = DRAWING_LIMITS.previewTtlMs;

describe('a stroke on its way', () => {
  it('is drawn as it will be stored, a line by its two points', () => {
    const calls = drawPreviews([preview({ kind: 'line', points: [[0, 0], [80, 20]] })], 100);

    expect(named(calls, 'lineTo').map((c) => c.args)).toEqual([[80, 20]]);
    expect(named(calls, 'stroke')[0]).toMatchObject({ strokeStyle: '#3d8bd9', lineWidth: 4 });
  });

  // Its sender keeps it alive with a frame a second while they hold still;
  // one whose sender has gone quiet fades out by its last frame's age.
  it('stays whole while its frames come, then fades and is gone by its time', () => {
    expect(previewOpacity(0, 1500, false)).toBe(1);
    expect(previewOpacity(0, TTL - 500, false)).toBeGreaterThan(0);
    expect(previewOpacity(0, TTL - 500, false)).toBeLessThan(1);
    expect(previewOpacity(0, TTL, false)).toBe(0);
    expect(named(drawPreviews([preview()], TTL + 1), 'stroke')).toEqual([]);
  });

  it('does not fade under reduced motion, and is gone at the same time', () => {
    expect(previewOpacity(0, TTL - 1, true)).toBe(1);
    expect(previewOpacity(0, TTL, true)).toBe(0);
  });

  it('is not drawn in the laser’s pass, nor the laser in its', () => {
    const laser = preview({ key: 'them:l', laser: true, times: [0, 0, 0] });
    const stroke = preview({ key: 'them:s', color: '#111111' });

    expect(named(drawPreviews([laser, stroke], 100), 'stroke').map((c) => c.strokeStyle)).toEqual(['#111111']);
    expect(named(drawPreviews([laser, stroke], 100, { laser: true }), 'stroke').every((c) => c.strokeStyle !== '#111111')).toBe(true);
  });

  it('for the DM alone is dashed in the DM’s view and left out of any other', () => {
    const secret = preview({ audience: 'DM' });

    expect(named(drawPreviews([secret], 100), 'stroke')[0].dash.length).toBeGreaterThan(0);
    expect(named(drawPreviews([secret], 100, { showDmOnly: false }), 'stroke')).toEqual([]);
  });
});

describe('the laser pointer', () => {
  it('fades point by point by each one’s age, the newest brightest', () => {
    const calls = drawPreviews([preview({ laser: true, points: [[0, 0], [10, 0], [20, 0], [30, 0]], times: [0, 1000, 2000, 2900], lastAt: 2900 })], 3000, { laser: true });

    const alphas = named(calls, 'stroke').map((c) => c.globalAlpha);
    expect(alphas.length).toBeGreaterThan(0);
    expect(alphas[alphas.length - 1]).toBeGreaterThan(alphas[0]);
    expect(laserPointOpacity(0, TTL / 2, false)).toBeCloseTo(0.5);
    expect(laserPointOpacity(0, TTL, false)).toBe(0);
  });

  it('shows whole under reduced motion until its time, then goes', () => {
    expect(laserPointOpacity(0, TTL - 1, true)).toBe(1);
    expect(laserPointOpacity(0, TTL, true)).toBe(0);
    const calls = drawPreviews([preview({ laser: true, points: [[0, 0], [10, 0], [20, 0]], times: [0, 1000, 2000], lastAt: 2000 })], 2500, { laser: true, reducedMotion: true });
    // Its core and its glow each at one strength along the whole trail, the core whole.
    const byWidth = new Map<unknown, Set<number>>();
    for (const c of named(calls, 'stroke')) byWidth.set(c.lineWidth, (byWidth.get(c.lineWidth) ?? new Set()).add(c.globalAlpha));
    expect([...byWidth.values()].every((alphas) => alphas.size === 1)).toBe(true);
    expect(Math.max(...[...byWidth.values()].map((alphas) => [...alphas][0]))).toBe(1);
  });

  // One sender may keep four pointers of 2,000 points each alive at once.
  // Each pass strokes a trail in a few strengths, one path each, so what a
  // repaint strokes does not grow with the points.
  it('strokes a trail of any length in a few paths a pass', () => {
    const points = Array.from({ length: 2000 }, (_, i): [number, number] => [i % 500, Math.floor(i / 500)]);
    const times = points.map((_, i) => (i * TTL) / points.length);
    const lasers = [0, 1, 2, 3].map((n) => preview({ key: `them:l${n}`, laser: true, points, times, lastAt: TTL - 1 }));

    const calls = drawPreviews(lasers, TTL, { laser: true });

    expect(named(calls, 'stroke').length).toBeLessThanOrEqual(64);
    expect(named(calls, 'lineTo').length).toBeGreaterThan(4 * 2 * 1900);
  });

  // A pointer is a signal for everyone at the table, so it is as thick on
  // every screen whatever its zoom.
  it('is drawn the same thickness on screen at any zoom', () => {
    const at = (zoom: number) => {
      const { ctx, calls } = recorder();
      drawDrawingPreviews(ctx, {
        previews: [preview({ laser: true, points: [[0, 0], [10, 0]], times: [0, 0], lastAt: 0 })],
        now: 10, reducedMotion: false, showDmOnly: true, laser: true,
      }, { ...viewport, zoom });
      return named(calls, 'stroke').map((c) => Number(c.lineWidth) * zoom);
    };

    expect(at(0.5)).toEqual(at(2));
  });
});
