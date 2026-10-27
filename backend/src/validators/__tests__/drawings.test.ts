/**
 * What a drawing on a map may be, and the words it is refused with.
 *
 * Each kind takes its own number of points: a pen stroke two or more, a
 * polygon three corners or more, a line, an arrow, a rectangle and an
 * ellipse exactly two, a text label one, with its text. Points are whole map
 * pixels within the bound walls and lights have. Only the markup layer is
 * drawn on, and only D's kinds: a texture, a stamp and the ground layer are
 * kept for DM-drawn map art and refused until it comes. A label loses its
 * control and direction characters before its length is counted.
 */

import {
  NewDrawingSchema, DrawingPreviewSchema, drawingOutsideMap, cleanLabel, DRAWING_LIMITS,
  DRAWING_KIND_REFUSAL, DRAWING_LAYER_REFUSAL, DRAWING_AUDIENCE_REFUSAL, DRAWING_COLOR_REFUSAL, DRAWING_WIDTH_REFUSAL,
  DRAWING_ROTATION_REFUSAL, DRAWING_SORT_KEY_REFUSAL, DRAWING_POINT_REFUSAL, DRAWING_POINT_COUNT_REFUSAL,
  DRAWING_TEXT_REFUSAL, DRAWING_TEXT_ON_SHAPE_REFUSAL, DRAWING_FILL_REFUSAL, DRAWING_PREVIEW_ID_REFUSAL,
  DRAWING_PREVIEW_POINTS_REFUSAL,
} from '../drawings';

const line = { kind: 'line', color: '#3d8bd9', width: 4, points: [[0, 0], [100, 50]] };

/** The refusal a drawing gets, or null when it is taken. */
function refusal(drawing: unknown): string | null {
  const parsed = NewDrawingSchema.safeParse(drawing);
  return parsed.success ? null : parsed.error.issues[0]?.message ?? '(no message)';
}

describe('NewDrawingSchema', () => {
  it('loads no database client', () => {
    let loaded = false;
    jest.isolateModules(() => {
      jest.doMock('../../config/database', () => {
        loaded = true;
        return {};
      });
      jest.requireActual('../drawings');
    });
    jest.dontMock('../../config/database');
    expect(loaded).toBe(false);
  });

  it('takes a line and fills in the defaults', () => {
    expect(NewDrawingSchema.parse(line)).toEqual({
      ...line, layer: 'MARKUP', audience: 'ALL', fillColor: null, rotation: 0, sortKey: 0, text: null,
    });
  });

  it('drops an id, an author, a time and the fields kept for map art', () => {
    const parsed = NewDrawingSchema.parse({
      ...line, id: 'mine', authorId: 'someone-else', createdAt: '2020-01-01', mapId: 'x', pattern: 'stone', stamp: 'door',
    });
    expect(Object.keys(parsed).sort()).toEqual(['audience', 'color', 'fillColor', 'kind', 'layer', 'points', 'rotation', 'sortKey', 'text', 'width']);
  });

  describe('the points each kind takes', () => {
    const pts = (n: number) => Array.from({ length: n }, (_, i) => [i * 10, i * 5]);

    it.each([
      ['pen', 2], ['pen', DRAWING_LIMITS.maxPoints], ['polygon', 3], ['polygon', 50],
      ['line', 2], ['arrow', 2], ['rect', 2], ['ellipse', 2],
    ])('takes a %s of %i points', (kind, n) => {
      expect(refusal({ ...line, kind, points: pts(n) })).toBeNull();
    });

    it.each([
      ['pen', 1, 'A pen stroke needs at least 2 points'],
      ['polygon', 2, 'A polygon needs at least 3 corners'],
      ['line', 3, 'A line has exactly 2 points'],
      ['arrow', 1, 'An arrow has exactly 2 points'],
      ['rect', 3, 'A rectangle has exactly 2 points'],
      ['ellipse', 1, 'An ellipse has exactly 2 points'],
    ])('refuses a %s of %i points', (kind, n, message) => {
      expect(refusal({ ...line, kind, points: pts(n) })).toBe(message);
    });

    it('refuses no points, or more than the most a drawing has', () => {
      expect(refusal({ ...line, kind: 'pen', points: [] })).toBe(DRAWING_POINT_COUNT_REFUSAL);
      expect(refusal({ ...line, kind: 'pen', points: pts(DRAWING_LIMITS.maxPoints + 1) })).toBe(DRAWING_POINT_COUNT_REFUSAL);
    });

    it.each([
      ['a fraction', [[0.5, 0], [10, 10]]],
      ['text', [['0', 0], [10, 10]]],
      ['a point of three numbers', [[0, 0, 0], [10, 10]]],
      ['a point of one number', [[0], [10, 10]]],
      ['an object', [{ x: 0, y: 0 }, [10, 10]]],
      ['a number past the bound on walls and lights', [[250001, 0], [10, 10]]],
      ['infinity', [[Infinity, 0], [10, 10]]],
    ])('refuses %s for a point', (_what, points) => {
      expect(refusal({ ...line, points })).toBe(DRAWING_POINT_REFUSAL);
    });

    it('takes a point at the bound either way', () => {
      expect(refusal({ ...line, points: [[-250000, -250000], [250000, 250000]] })).toBeNull();
    });
  });

  describe('a text label', () => {
    const label = { kind: 'text', color: '#1a1a1a', width: 4, points: [[40, 40]] };

    it('takes one point and its text', () => {
      expect(NewDrawingSchema.parse({ ...label, text: 'Trap here' }).text).toBe('Trap here');
    });

    it('has exactly one point', () => {
      expect(refusal({ ...label, text: 'Two', points: [[0, 0], [1, 1]] })).toBe('A text label has exactly 1 point');
    });

    it.each([
      ['no text', undefined],
      ['null', null],
      ['empty text', ''],
      ['blank text', '  \t '],
      ['only control characters', '\u0000\u0007‮'],
      ['text that is not text', 42],
      ['201 characters', 'x'.repeat(201)],
    ])('refuses %s', (_what, text) => {
      expect(refusal({ ...label, text })).toBe(DRAWING_TEXT_REFUSAL);
    });

    it('takes 200 characters', () => {
      expect(refusal({ ...label, text: 'x'.repeat(200) })).toBeNull();
    });

    it('removes control and direction characters, then counts', () => {
      const text = `${'x'.repeat(200)}\u0000\u0007\n‮⁦`;
      expect(NewDrawingSchema.parse({ ...label, text }).text).toBe('x'.repeat(200));
      expect(cleanLabel('A‮B‏C\r\nD')).toBe('ABCD');
    });

    it('keeps the joiners emoji are made with', () => {
      const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
      expect(cleanLabel(` ${family} `)).toBe(family);
    });

    it('is the only kind with text', () => {
      expect(refusal({ ...line, text: 'Not here' })).toBe(DRAWING_TEXT_ON_SHAPE_REFUSAL);
      expect(refusal({ ...line, text: null })).toBeNull();
    });
  });

  describe('the fields every drawing has', () => {
    it.each([
      ['a kind kept for map art', { kind: 'tiles' }, DRAWING_KIND_REFUSAL],
      ['a stamp', { kind: 'stamp' }, DRAWING_KIND_REFUSAL],
      ['an unknown kind', { kind: 'circle' }, DRAWING_KIND_REFUSAL],
      ['the ground layer', { layer: 'GROUND' }, DRAWING_LAYER_REFUSAL],
      ['a layer that is not one', { layer: 'TOP' }, DRAWING_LAYER_REFUSAL],
      ['an audience that is not one', { audience: 'PLAYERS' }, DRAWING_AUDIENCE_REFUSAL],
      ['a colour name', { color: 'red' }, DRAWING_COLOR_REFUSAL],
      ['a short colour', { color: '#fff' }, DRAWING_COLOR_REFUSAL],
      ['a colour with more after it', { color: '#ffffff; background: url(x)' }, DRAWING_COLOR_REFUSAL],
      ['a fill that is not a colour', { kind: 'rect', fillColor: 'blue' }, DRAWING_COLOR_REFUSAL],
      ['a width of 0', { width: 0 }, DRAWING_WIDTH_REFUSAL],
      ['a width of 65', { width: 65 }, DRAWING_WIDTH_REFUSAL],
      ['a fractional width', { width: 2.5 }, DRAWING_WIDTH_REFUSAL],
      ['no width', { width: undefined }, DRAWING_WIDTH_REFUSAL],
      ['a rotation of 360', { rotation: 360 }, DRAWING_ROTATION_REFUSAL],
      ['a negative rotation', { rotation: -1 }, DRAWING_ROTATION_REFUSAL],
      ['a sortKey past a million', { sortKey: 1_000_001 }, DRAWING_SORT_KEY_REFUSAL],
      ['a sortKey past the column', { sortKey: 2 ** 31 }, DRAWING_SORT_KEY_REFUSAL],
      ['a fractional sortKey', { sortKey: 0.5 }, DRAWING_SORT_KEY_REFUSAL],
    ])('refuses %s', (_what, change, message) => {
      expect(refusal({ ...line, ...change })).toBe(message);
    });

    it('takes the widths, rotations and sortKeys at their bounds', () => {
      for (const change of [{ width: 1 }, { width: 64 }, { rotation: 359 }, { sortKey: -1_000_000 }, { sortKey: 1_000_000 }]) {
        expect(refusal({ ...line, ...change })).toBeNull();
      }
    });

    it('takes a drawing for the DM alone', () => {
      expect(NewDrawingSchema.parse({ ...line, audience: 'DM' }).audience).toBe('DM');
    });

    it('fills only a rectangle, an ellipse or a polygon', () => {
      for (const kind of ['rect', 'ellipse']) expect(refusal({ ...line, kind, fillColor: '#e8a33c' })).toBeNull();
      expect(refusal({ ...line, kind: 'polygon', points: [[0, 0], [10, 0], [5, 5]], fillColor: '#e8a33c' })).toBeNull();
      for (const kind of ['line', 'arrow']) expect(refusal({ ...line, kind, fillColor: '#e8a33c' })).toBe(DRAWING_FILL_REFUSAL);
      expect(refusal({ ...line, kind: 'pen', fillColor: '#e8a33c' })).toBe(DRAWING_FILL_REFUSAL);
    });

    it.each([['nothing', undefined], ['null', null], ['text', 'a line'], ['a list', [line]]])('refuses %s as a drawing', (_what, value) => {
      expect(refusal(value)).not.toBeNull();
    });
  });
});

describe('drawingOutsideMap', () => {
  // 10 by 8 squares of 50 pixels; walls and lights may reach 500 squares past the edges.
  const map = { width: 10, height: 8, gridSize: 50 };

  it('takes points on the map and up to 500 squares past its edges', () => {
    expect(drawingOutsideMap([[0, 0], [500, 400]], map)).toBe(false);
    expect(drawingOutsideMap([[-25000, -25000], [25500, 25400]], map)).toBe(false);
  });

  it('refuses any point further out than that', () => {
    expect(drawingOutsideMap([[0, 0], [25501, 0]], map)).toBe(true);
    expect(drawingOutsideMap([[0, -25001]], map)).toBe(true);
  });
});

describe('DrawingPreviewSchema', () => {
  const frame = { previewId: 'stroke-1', kind: 'pen', color: '#d94f3d', width: 3, points: [[1, 1], [2, 3]] };

  it('takes a frame and fills in the defaults', () => {
    expect(DrawingPreviewSchema.parse(frame)).toEqual({ ...frame, audience: 'ALL', laser: false, end: false });
  });

  it('takes a laser pointer frame and an end frame with no points', () => {
    expect(DrawingPreviewSchema.parse({ ...frame, laser: true }).laser).toBe(true);
    expect(DrawingPreviewSchema.parse({ ...frame, points: [], end: true })).toMatchObject({ points: [], end: true });
  });

  it.each([
    ['a previewId that is not a short id', { previewId: 'has spaces' }, DRAWING_PREVIEW_ID_REFUSAL],
    ['a previewId over 64 characters', { previewId: 'x'.repeat(65) }, DRAWING_PREVIEW_ID_REFUSAL],
    ['more new points than a frame adds', { points: Array.from({ length: 65 }, () => [1, 1]) }, DRAWING_PREVIEW_POINTS_REFUSAL],
    ['a fractional point', { points: [[1.5, 1]] }, DRAWING_POINT_REFUSAL],
    ['a width past 64', { width: 100 }, DRAWING_WIDTH_REFUSAL],
    ['a colour that is not one', { color: 'red' }, DRAWING_COLOR_REFUSAL],
  ])('refuses %s', (_what, change, message) => {
    const parsed = DrawingPreviewSchema.safeParse({ ...frame, ...change });
    expect(parsed.success ? null : parsed.error.issues[0]?.message).toBe(message);
  });
});
