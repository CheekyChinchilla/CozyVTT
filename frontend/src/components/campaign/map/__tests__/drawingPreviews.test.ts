/**
 * The strokes on their way a page shows, built from their senders' frames,
 * and which drawings a clear took from the page.
 */

import { describe, it, expect } from 'vitest';
import { applyPreviewFrame, prunePreviews, previewKey, clearedBy, PREVIEWS_KEPT_PER_SENDER, PREVIEW_POINTS_KEPT } from '../drawingPreviews';
import type { ActivePreview } from '../layers/drawDrawings';
import type { Drawing, DrawingPreview } from '@/types/drawings';
import { DRAWING_LIMITS } from '@/constants/drawingLimits';

const TTL = DRAWING_LIMITS.previewTtlMs;
/** The key of the frames below: sender `them`, stroke `p1`. */
const K = previewKey('them', 'p1');

function frame(extra: Partial<Required<DrawingPreview>> = {}): Required<DrawingPreview> {
  return { previewId: 'p1', kind: 'pen', color: '#3d8bd9', width: 4, audience: 'ALL', laser: false, points: [], end: false, ...extra };
}

describe('a stroke’s frames', () => {
  it('build a pen stroke point by point', () => {
    const previews = new Map<string, ActivePreview>();
    const key = previewKey('them', 'p1');

    applyPreviewFrame(previews, 'them', frame({ points: [[0, 0], [5, 5]] }), 100);
    applyPreviewFrame(previews, 'them', frame({ points: [[9, 9]] }), 150);

    expect(previews.get(key)).toMatchObject({ points: [[0, 0], [5, 5], [9, 9]], times: [100, 100, 150], lastAt: 150, kind: 'pen' });
  });

  it('carry a line’s two points whole, each frame in place of the last', () => {
    const previews = new Map<string, ActivePreview>();

    applyPreviewFrame(previews, 'them', frame({ kind: 'line', points: [[0, 0], [5, 5]] }), 100);
    applyPreviewFrame(previews, 'them', frame({ kind: 'line', points: [[0, 0], [40, 10]] }), 150);

    expect(previews.get(K)?.points).toEqual([[0, 0], [40, 10]]);
  });

  it('keep a stroke alive with a frame of no points', () => {
    const previews = new Map<string, ActivePreview>();

    applyPreviewFrame(previews, 'them', frame({ points: [[0, 0], [5, 5]] }), 100);
    applyPreviewFrame(previews, 'them', frame(), 2000);

    expect(previews.get(K)).toMatchObject({ points: [[0, 0], [5, 5]], lastAt: 2000 });
  });

  it('end with the last, which drops the stroke at once', () => {
    const previews = new Map<string, ActivePreview>();

    applyPreviewFrame(previews, 'them', frame({ points: [[0, 0], [5, 5]] }), 100);
    applyPreviewFrame(previews, 'them', frame({ end: true }), 120);

    expect(previews.has(K)).toBe(false);
  });

  it('never hold more points than a drawing may, the oldest going first', () => {
    const previews = new Map<string, ActivePreview>();
    const run = (from: number) => Array.from({ length: 64 }, (_, i): [number, number] => [from + i, 0]);

    for (let i = 0; i < Math.ceil(DRAWING_LIMITS.maxPoints / 64) + 2; i++) applyPreviewFrame(previews, 'them', frame({ points: run(i * 64) }), i);

    const shown = previews.get(K)!;
    expect(shown.points).toHaveLength(DRAWING_LIMITS.maxPoints);
    expect(shown.times).toHaveLength(DRAWING_LIMITS.maxPoints);
    expect(shown.points[0][0]).toBeGreaterThan(0);
  });
});

describe('what has had its time', () => {
  it('drops a stroke whose sender went quiet, and keeps one still coming', () => {
    const previews = new Map<string, ActivePreview>();
    applyPreviewFrame(previews, 'quiet', frame({ points: [[0, 0], [1, 1]] }), 0);
    applyPreviewFrame(previews, 'busy', frame({ points: [[0, 0], [1, 1]] }), 2500);

    expect(prunePreviews(previews, TTL - 1)).toBe(true);
    expect(previews.has(previewKey('quiet', 'p1'))).toBe(true);
    expect(prunePreviews(previews, TTL)).toBe(true);
    expect([...previews.keys()]).toEqual([previewKey('busy', 'p1')]);
    expect(prunePreviews(previews, 2500 + TTL)).toBe(false);
  });

  it('drops a laser’s points as they age, and the laser with its last', () => {
    const previews = new Map<string, ActivePreview>();
    applyPreviewFrame(previews, 'them', frame({ laser: true, points: [[0, 0]] }), 0);
    applyPreviewFrame(previews, 'them', frame({ laser: true, points: [[10, 0]] }), 1000);

    prunePreviews(previews, TTL + 10);
    expect(previews.get(K)?.points).toEqual([[10, 0]]);
    prunePreviews(previews, 1000 + TTL);
    expect(previews.has(K)).toBe(false);
  });
});

// The server lets one user send 60 frames a second of 64 new points each,
// under as many previewIds as they like. What one page keeps of them is
// bounded here, or a peer's script makes every other page stroke hundreds of
// thousands of points 30 times a second.
describe('what a page keeps of other people’s strokes', () => {
  const run = (from: number) => Array.from({ length: 64 }, (_, i): [number, number] => [(from * 7 + i * 13) % 4000, (from * 3 + i * 29) % 4000]);
  const total = (previews: Map<string, ActivePreview>) => [...previews.values()].reduce((n, p) => n + p.points.length, 0);
  const of = (previews: Map<string, ActivePreview>, sender: string) => [...previews.keys()].filter((k) => k.startsWith(`${sender}:`));

  /** One sender at the server's most, 60 frames a second of 64 points, cycling 170 previewIds, for `seconds`. */
  function flood(previews: Map<string, ActivePreview>, sender: string, seconds: number, startAt = 0, beside?: (t: number, frameNo: number) => void) {
    let t = startAt;
    for (let s = 0; s < seconds * 60; s++) {
      t += 1000 / 60;
      applyPreviewFrame(previews, sender, frame({ previewId: `p${s % 170}`, width: 64, points: run(s) }), t);
      beside?.(t, s);
      if (s % 2 === 0) prunePreviews(previews, t);
    }
    return t;
  }

  it('keeps at most a few strokes from one sender, however many previewIds they cycle', () => {
    const previews = new Map<string, ActivePreview>();

    flood(previews, 'hostile', 60);

    expect(of(previews, 'hostile').length).toBeLessThanOrEqual(PREVIEWS_KEPT_PER_SENDER);
    expect(total(previews)).toBeLessThanOrEqual(PREVIEWS_KEPT_PER_SENDER * DRAWING_LIMITS.maxPoints);
  });

  it('keeps a second sender’s stroke through the first one’s flood', () => {
    const previews = new Map<string, ActivePreview>();

    flood(previews, 'hostile', 30, 0, (t, n) => {
      // Mara draws a stroke at the tool's 20 frames a second meanwhile.
      if (n % 3 === 0) applyPreviewFrame(previews, 'mara', frame({ previewId: 'stroke', points: [[n % 500, 10]] }), t);
    });

    expect(previews.has(previewKey('mara', 'stroke'))).toBe(true);
  });

  it('keeps at most PREVIEW_POINTS_KEPT points in all, letting the stalest strokes go first and never the one just sent', () => {
    const previews = new Map<string, ActivePreview>();
    let t = 0;
    // Many senders, each a stroke of the most a drawing may hold.
    for (let sender = 0; sender < 15; sender++) {
      for (let n = 0; n < DRAWING_LIMITS.maxPoints / 64; n++) {
        t += 1;
        applyPreviewFrame(previews, `s${sender}`, frame({ previewId: 'p', points: run(n) }), t);
      }
    }

    expect(total(previews)).toBeLessThanOrEqual(PREVIEW_POINTS_KEPT);
    expect(previews.has(previewKey('s14', 'p'))).toBe(true);
    expect(previews.has(previewKey('s0', 'p'))).toBe(false);

    // A new stroke's first frame always stays.
    applyPreviewFrame(previews, 'late', frame({ previewId: 'q', points: run(1) }), t + 1);
    expect(previews.has(previewKey('late', 'q'))).toBe(true);
    expect(total(previews)).toBeLessThanOrEqual(PREVIEW_POINTS_KEPT);
  });

  it('lets one sender’s stalest stroke go for a new one past the few it may keep', () => {
    const previews = new Map<string, ActivePreview>();
    for (let i = 0; i < PREVIEWS_KEPT_PER_SENDER; i++) applyPreviewFrame(previews, 'them', frame({ previewId: `p${i}` }), 100 + i);
    // The first is refreshed, so the second is the stalest.
    applyPreviewFrame(previews, 'them', frame({ previewId: 'p0' }), 200);

    applyPreviewFrame(previews, 'them', frame({ previewId: 'new' }), 300);

    expect(previews.has(previewKey('them', 'p1'))).toBe(false);
    expect(previews.has(previewKey('them', 'p0'))).toBe(true);
    expect(previews.has(previewKey('them', 'new'))).toBe(true);
  });
});

describe('a clear', () => {
  const drawing = (extra: Partial<Drawing>): Drawing => ({
    id: 'x', authorId: 'mara', audience: 'ALL', layer: 'MARKUP', kind: 'line', color: '#d94f3d', fillColor: null, width: 4,
    rotation: 0, sortKey: 0, points: [[0, 0], [1, 1]], text: null, createdAt: '2026-10-27T10:00:00.000Z', ...extra,
  });

  it('takes every drawing on its layer, whoever drew it, when it names nobody', () => {
    const took = clearedBy({ mapId: 'm', layer: 'MARKUP' }, { role: 'PLAYER', userId: 'me' });

    expect(took(drawing({ authorId: 'dm' }))).toBe(true);
    expect(took(drawing({ authorId: null }))).toBe(true);
    expect(took(drawing({ layer: 'GROUND' }))).toBe(false);
  });

  it('takes a player’s drawings for everyone, and leaves on the DM’s page those they wrote for the DM alone in the seat', () => {
    const onTheDmsPage = clearedBy({ mapId: 'm', layer: 'MARKUP', authorId: 'mara' }, { role: 'DM', userId: 'dm' });

    expect(onTheDmsPage(drawing({}))).toBe(true);
    expect(onTheDmsPage(drawing({ audience: 'DM' }))).toBe(false);
    expect(onTheDmsPage(drawing({ authorId: 'tom' }))).toBe(false);
  });

  it('takes every drawing of the DM’s own, sent from the DM’s other tab', () => {
    const took = clearedBy({ mapId: 'm', layer: 'MARKUP', authorId: 'dm' }, { role: 'DM', userId: 'dm' });

    expect(took(drawing({ authorId: 'dm', audience: 'DM' }))).toBe(true);
    expect(took(drawing({ authorId: 'dm' }))).toBe(true);
  });
});
