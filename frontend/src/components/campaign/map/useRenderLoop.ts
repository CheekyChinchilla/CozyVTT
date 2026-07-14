// ============================================
// useRenderLoop — single rAF draw scheduler with per-layer dirty flags
//.
//
// The map is drawn on three stacked canvases (terrain / tokens /
// overlay). Instead of the old pattern — a `useEffect(() => render())`
// plus ~25 imperative `render()` calls that each repainted the whole
// scene synchronously, several times per mousemove — callers now mark
// the affected layer(s) dirty. One requestAnimationFrame later, only
// the dirty layers repaint, at most once each per frame.
//
// `drawLayerRef` is a latest-ref to the component's draw dispatcher so
// the loop always calls the newest closure (draw state changes every
// render) without re-subscribing the frame.
// ============================================

import { useCallback, useEffect, useRef, type RefObject } from 'react';

export type MapLayer = 'terrain' | 'tokens' | 'overlay';

export function useRenderLoop(drawLayerRef: RefObject<(layer: MapLayer) => void>) {
  const dirtyRef = useRef({ terrain: true, tokens: true, overlay: true });
  const frameRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    const dirty = dirtyRef.current;
    const draw = drawLayerRef.current;
    if (!draw) return;
    // Fixed z-order: terrain → tokens → overlay.
    if (dirty.terrain) { dirty.terrain = false; draw('terrain'); }
    if (dirty.tokens) { dirty.tokens = false; draw('tokens'); }
    if (dirty.overlay) { dirty.overlay = false; draw('overlay'); }
  }, [drawLayerRef]);

  const markDirty = useCallback((...layers: MapLayer[]) => {
    const dirty = dirtyRef.current;
    for (const layer of layers) dirty[layer] = true;
    if (frameRef.current == null) {
      frameRef.current = requestAnimationFrame(flush);
    }
  }, [flush]);

  const markAll = useCallback(() => {
    markDirty('terrain', 'tokens', 'overlay');
  }, [markDirty]);

  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  return { markDirty, markAll };
}
