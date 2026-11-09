/**
 * The drawings on the page: asked for once the campaign is joined, kept as
 * the server's events change them, this page's own adds, erases and clears
 * shown at once and taken back when refused, and the strokes on their way
 * that other members send. The socket is a stand-in that records what is
 * sent and answers as the test says.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMapDrawings, type MapDrawingsSocket } from '../useMapDrawings';
import { useGameStore } from '@/stores/gameStore';
import { DRAWING_LIMITS } from '@/constants/drawingLimits';
import type { DoneAck } from '@/types';
import type { Drawing, DrawingAddAck, DrawingPreview, NewDrawing } from '@/types/drawings';

type Answer<T> = (data: unknown) => Promise<T>;

function fakeSocket() {
  const handlers = new Map<string, Set<(data: never) => void>>();
  const sent: Array<[string, unknown]> = [];
  const answers = {
    add: (async () => ({ ok: true, id: 'stored-1' })) as Answer<DrawingAddAck>,
    done: (async () => ({ ok: true })) as Answer<DoneAck>,
  };
  const listen = (event: string) => (cb: (data: never) => void) => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(cb);
  };
  const socket: MapDrawingsSocket = {
    addDrawing: (data) => { sent.push(['drawing:add', data]); return answers.add(data); },
    removeDrawing: (data) => { sent.push(['drawing:remove', data]); return answers.done(data); },
    clearMyDrawings: (data) => { sent.push(['drawing:clear_mine', data]); return answers.done(data); },
    clearDrawings: (data) => { sent.push(['drawing:clear', data]); return answers.done(data); },
    sendDrawingPreview: (data) => { sent.push(['drawing:preview', data]); },
    requestDrawings: (data) => { sent.push(['drawings:request', data]); },
    onDrawingAdded: listen('drawing:added'),
    onDrawingRemoved: listen('drawing:removed'),
    onDrawingsCleared: listen('drawings:cleared'),
    onDrawingPreviewed: listen('drawing:previewed'),
    onDrawingsState: listen('drawings:state'),
    off: (event, cb) => { if (cb) handlers.get(event)?.delete(cb); },
  };
  return {
    socket,
    sent,
    answers,
    of: (event: string) => sent.filter(([e]) => e === event).map(([, p]) => p),
    fire: (event: string, data: unknown) => act(() => { handlers.get(event)?.forEach((fn) => (fn as (d: unknown) => void)(data)); }),
    listening: (event: string) => handlers.get(event)?.size ?? 0,
  };
}

let made = 0;
function drawing(extra: Partial<Drawing> = {}): Drawing {
  made += 1;
  return {
    id: `d${made}`, authorId: 'them', audience: 'ALL', layer: 'MARKUP', kind: 'line', color: '#d94f3d', fillColor: null,
    width: 4, rotation: 0, sortKey: 0, points: [[0, 0], [10, 10]], text: null,
    createdAt: `2026-10-27T10:00:${String(made % 60).padStart(2, '0')}.000Z`, ...extra,
  };
}

const line: NewDrawing = { kind: 'line', color: '#4caf6e', width: 4, points: [[0, 0], [50, 50]] };

function frame(extra: Partial<Required<DrawingPreview>> = {}): Required<DrawingPreview> {
  return { previewId: 'p1', kind: 'pen', color: '#3d8bd9', width: 4, audience: 'ALL', laser: false, points: [[0, 0], [5, 5]], end: false, ...extra };
}

interface Props { mapId: string | undefined; joinedEpoch: number; role: string; userId: string }

function mount(fake: ReturnType<typeof fakeSocket>, initial: Partial<Props> = {}) {
  const markDirty = vi.fn();
  const onRefused = vi.fn();
  const view = renderHook((props: Props) => useMapDrawings({ socket: fake.socket, ...props, markDirty, onRefused }), {
    initialProps: { mapId: 'map-a', joinedEpoch: 1, role: 'PLAYER', userId: 'me', ...initial },
  });
  return { ...view, markDirty, onRefused };
}

const ids = () => useGameStore.getState().drawings.map((d) => d.id);
/** Let the answers the stand-in gave resolve. */
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  useGameStore.getState().clearGameState();
});

afterEach(() => {
  vi.useRealTimers();
});

// A label drawn before its font arrived was measured in the fallback font,
// and is measured again when the map is next drawn.
describe('a font loading', () => {
  it('has the map drawn again', () => {
    const fonts = new EventTarget();
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
    try {
      const view = mount(fakeSocket());
      view.markDirty.mockClear();

      act(() => { fonts.dispatchEvent(new Event('loadingdone')); });

      expect(view.markDirty).toHaveBeenCalledWith('terrain', 'overlay');
      view.unmount();
      view.markDirty.mockClear();
      fonts.dispatchEvent(new Event('loadingdone'));
      expect(view.markDirty).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(document, 'fonts');
    }
  });
});

describe('asking for a map’s drawings', () => {
  it('asks once the campaign is joined, and again on a rejoin, another map and a change of role', () => {
    const fake = fakeSocket();
    const view = mount(fake, { joinedEpoch: 0 });
    expect(fake.of('drawings:request')).toEqual([]);

    view.rerender({ mapId: 'map-a', joinedEpoch: 1, role: 'PLAYER', userId: 'me' });
    view.rerender({ mapId: 'map-a', joinedEpoch: 2, role: 'PLAYER', userId: 'me' });
    view.rerender({ mapId: 'map-b', joinedEpoch: 2, role: 'PLAYER', userId: 'me' });
    view.rerender({ mapId: 'map-b', joinedEpoch: 2, role: 'DM', userId: 'me' });

    expect(fake.of('drawings:request')).toEqual([{ mapId: 'map-a' }, { mapId: 'map-a' }, { mapId: 'map-b' }, { mapId: 'map-b' }]);
  });

  it('takes the answer in place of what it held, and no answer for another map', () => {
    const fake = fakeSocket();
    mount(fake);
    fake.fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ id: 'a' }), drawing({ id: 'b' })] });
    fake.fire('drawings:state', { mapId: 'map-b', drawings: [drawing({ id: 'x' })] });
    expect(ids()).toEqual(['a', 'b']);

    // Sent by itself after Edit Map's resize or a role change: the list whole.
    fake.fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ id: 'b' })] });
    expect(ids()).toEqual(['b']);
  });
});

describe('what others draw and erase', () => {
  it('adds a drawing someone else made, once, and none for another map', () => {
    const fake = fakeSocket();
    mount(fake);
    const made1 = drawing({ id: 'theirs' });

    fake.fire('drawing:added', { mapId: 'map-a', drawing: made1 });
    fake.fire('drawing:added', { mapId: 'map-a', drawing: made1 });
    fake.fire('drawing:added', { mapId: 'map-b', drawing: drawing({ id: 'elsewhere' }) });

    expect(ids()).toEqual(['theirs']);
  });

  it('lets go of an erased drawing', () => {
    const fake = fakeSocket();
    mount(fake);
    fake.fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ id: 'a' }), drawing({ id: 'b' })] });

    fake.fire('drawing:removed', { mapId: 'map-a', drawingId: 'a' });
    fake.fire('drawing:removed', { mapId: 'map-b', drawingId: 'b' });

    expect(ids()).toEqual(['b']);
  });

  it('lets go of what a clear took: every drawing, or one player’s for everyone', () => {
    const fake = fakeSocket();
    mount(fake, { role: 'DM', userId: 'dm' });
    fake.fire('drawings:state', {
      mapId: 'map-a',
      drawings: [drawing({ id: 'mara1', authorId: 'mara' }), drawing({ id: 'mara-secret', authorId: 'mara', audience: 'DM' }), drawing({ id: 'tom1', authorId: 'tom' })],
    });

    fake.fire('drawings:cleared', { mapId: 'map-a', layer: 'MARKUP', authorId: 'mara' });
    expect(ids()).toEqual(['mara-secret', 'tom1']);

    fake.fire('drawings:cleared', { mapId: 'map-a', layer: 'MARKUP' });
    expect(ids()).toEqual([]);
  });

  // A page whose member is no longer the DM keeps no drawing for the DM
  // alone, whatever arrives after (the server sends the list again too).
  it('drops every drawing for the DM alone as soon as its role is not the DM’s', () => {
    const fake = fakeSocket();
    const view = mount(fake, { role: 'DM' });
    fake.fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ id: 'secret', audience: 'DM' }), drawing({ id: 'open' })] });

    view.rerender({ mapId: 'map-a', joinedEpoch: 1, role: 'PLAYER', userId: 'me' });

    expect(ids()).toEqual(['open']);
  });
});

describe('this page’s own add', () => {
  it('is drawn at once, and the stored drawing takes its place when the server echoes it', async () => {
    const fake = fakeSocket();
    const view = mount(fake);

    act(() => { view.result.current.add('map-a', line, 'p9'); });
    expect(ids()).toHaveLength(1);
    expect(ids()[0]).toMatch(/^pending:/);
    const [sent] = fake.of('drawing:add') as Array<{ mapId: string; drawing: NewDrawing; opId: string; previewId: string }>;
    expect(sent).toMatchObject({ mapId: 'map-a', drawing: line, previewId: 'p9' });

    fake.fire('drawing:added', { mapId: 'map-a', drawing: drawing({ id: 'stored-1', authorId: 'me' }), opId: sent.opId, previewId: 'p9' });
    await settle();

    expect(ids()).toEqual(['stored-1']);
  });

  it('takes the answer’s id if no echo came', async () => {
    const fake = fakeSocket();
    const view = mount(fake);

    act(() => { view.result.current.add('map-a', line); });
    await settle();

    expect(ids()).toEqual(['stored-1']);
  });

  it('is taken back when refused, with the reason, and its preview ended on every other screen', async () => {
    const fake = fakeSocket();
    fake.answers.add = async () => ({ ok: false, error: 'This map holds as much drawing as it can. Erase some first.' });
    const view = mount(fake);

    act(() => { view.result.current.add('map-a', line, 'p9'); });
    await settle();

    expect(ids()).toEqual([]);
    expect(view.onRefused).toHaveBeenCalledWith('This map holds as much drawing as it can. Erase some first.');
    expect(fake.of('drawing:preview')).toEqual([
      { mapId: 'map-a', preview: { previewId: 'p9', kind: 'line', color: '#4caf6e', width: 4, points: [], end: true } },
    ]);
  });

  it('for the DM alone is shown as the DM’s, and a player’s as everyone’s', () => {
    const fake = fakeSocket();
    const view = mount(fake, { role: 'PLAYER' });

    act(() => { view.result.current.add('map-a', { ...line, audience: 'DM' }); });

    expect(useGameStore.getState().drawings[0]).toMatchObject({ audience: 'ALL', authorId: 'me' });
  });
});

describe('this page’s own erase and clears', () => {
  it('erases at once, and puts the drawing back with the reason when refused', async () => {
    const fake = fakeSocket();
    const view = mount(fake);
    const mine = drawing({ id: 'mine', authorId: 'me' });
    fake.fire('drawings:state', { mapId: 'map-a', drawings: [mine] });

    fake.answers.done = async () => ({ ok: false, error: 'You can erase only your own drawings' });
    act(() => { view.result.current.erase(mine); });
    expect(ids()).toEqual([]);
    await settle();

    expect(ids()).toEqual(['mine']);
    expect(fake.of('drawing:remove')).toMatchObject([{ mapId: 'map-a', drawingId: 'mine' }]);
    expect(view.onRefused).toHaveBeenCalledWith('You can erase only your own drawings');
    // And the server's list asked for, in case someone else erased it meanwhile.
    expect(fake.of('drawings:request').slice(-1)).toEqual([{ mapId: 'map-a' }]);
  });

  it('clears a player’s own drawings for everyone at once, and asks for the list again if refused', async () => {
    const fake = fakeSocket();
    const view = mount(fake);
    fake.fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ id: 'mine', authorId: 'me' }), drawing({ id: 'theirs' })] });

    act(() => { view.result.current.clearMine(); });
    expect(ids()).toEqual(['theirs']);
    expect(fake.of('drawing:clear_mine')).toMatchObject([{ mapId: 'map-a' }]);

    fake.answers.done = async () => ({ ok: false, error: 'Too many clears' });
    act(() => { view.result.current.clearMine(); });
    await settle();
    expect(fake.of('drawings:request').slice(-1)).toEqual([{ mapId: 'map-a' }]);
    expect(view.onRefused).toHaveBeenCalledWith('Too many clears');
  });

  it('clears one player’s drawings for everyone for the DM, at once, and asks for the list again if refused', async () => {
    const fake = fakeSocket();
    const view = mount(fake, { role: 'DM', userId: 'dm' });
    fake.fire('drawings:state', {
      mapId: 'map-a',
      drawings: [drawing({ id: 'mara1', authorId: 'mara' }), drawing({ id: 'mara-seat', authorId: 'mara', audience: 'DM' }), drawing({ id: 'tom1', authorId: 'tom' })],
    });

    act(() => { view.result.current.clearMember('mara'); });
    expect(ids()).toEqual(['mara-seat', 'tom1']);
    expect(fake.of('drawing:clear')).toEqual([{ mapId: 'map-a', layer: 'MARKUP', authorId: 'mara' }]);

    fake.answers.done = async () => ({ ok: false, error: 'Too many clears' });
    act(() => { view.result.current.clearMember('tom'); });
    await settle();
    expect(fake.of('drawings:request').slice(-1)).toEqual([{ mapId: 'map-a' }]);
    expect(view.onRefused).toHaveBeenCalledWith('Too many clears');
  });

  it('clears every drawing for the DM', () => {
    const fake = fakeSocket();
    const view = mount(fake, { role: 'DM', userId: 'dm' });
    fake.fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ id: 'a' }), drawing({ id: 'b', audience: 'DM' })] });

    act(() => { view.result.current.clearAll(); });

    expect(ids()).toEqual([]);
    expect(fake.of('drawing:clear')).toMatchObject([{ mapId: 'map-a', layer: 'MARKUP' }]);
  });
});

describe('strokes on their way from others', () => {
  const shown = (view: ReturnType<typeof mount>) => [...view.result.current.previews.current.values()];

  it('are shown as their frames come, and dropped by an end frame', () => {
    const fake = fakeSocket();
    const view = mount(fake);

    fake.fire('drawing:previewed', { mapId: 'map-a', userId: 'them', preview: frame() });
    fake.fire('drawing:previewed', { mapId: 'map-a', userId: 'them', preview: frame({ points: [[9, 9]] }) });
    expect(shown(view).map((p) => p.points)).toEqual([[[0, 0], [5, 5], [9, 9]]]);
    expect(view.markDirty).toHaveBeenCalledWith('overlay');

    fake.fire('drawing:previewed', { mapId: 'map-a', userId: 'them', preview: frame({ points: [], end: true }) });
    expect(shown(view)).toEqual([]);
  });

  it('are dropped when the drawing they end is stored, in its place', () => {
    const fake = fakeSocket();
    const view = mount(fake);
    fake.fire('drawing:previewed', { mapId: 'map-a', userId: 'them', preview: frame({ previewId: 'p7' }) });

    fake.fire('drawing:added', { mapId: 'map-a', drawing: drawing({ id: 'stored', authorId: 'them' }), previewId: 'p7' });

    expect(shown(view)).toEqual([]);
    expect(ids()).toEqual(['stored']);
  });

  it('for another map are not shown', () => {
    const fake = fakeSocket();
    const view = mount(fake);

    fake.fire('drawing:previewed', { mapId: 'map-b', userId: 'them', preview: frame() });

    expect(shown(view)).toEqual([]);
  });

  // Review focus: a map switch mid-preview leaves no ghost, of the stroke or of the old map's drawings.
  it('go with the map when it switches, with its drawings', () => {
    const fake = fakeSocket();
    const view = mount(fake);
    fake.fire('drawings:state', { mapId: 'map-a', drawings: [drawing({ id: 'a' })] });
    fake.fire('drawing:previewed', { mapId: 'map-a', userId: 'them', preview: frame() });

    view.rerender({ mapId: 'map-b', joinedEpoch: 1, role: 'PLAYER', userId: 'me' });

    expect(shown(view)).toEqual([]);
    expect(ids()).toEqual([]);
    expect(useGameStore.getState().drawingsMapId).toBe('map-b');
  });

  it('fade out when their sender goes quiet, gone 3 seconds after the last frame', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'performance'] });
    const fake = fakeSocket();
    const view = mount(fake);
    fake.fire('drawing:previewed', { mapId: 'map-a', userId: 'them', preview: frame() });

    await act(async () => { vi.advanceTimersByTime(DRAWING_LIMITS.previewTtlMs - 200); });
    expect(shown(view)).toHaveLength(1);
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(shown(view)).toEqual([]);
  });
});

describe('the listeners', () => {
  it('are taken off when the page goes', () => {
    const fake = fakeSocket();
    const view = mount(fake);
    expect(fake.listening('drawing:added')).toBe(1);

    view.unmount();

    for (const event of ['drawing:added', 'drawing:removed', 'drawings:cleared', 'drawing:previewed', 'drawings:state']) {
      expect(fake.listening(event)).toBe(0);
    }
  });
});
