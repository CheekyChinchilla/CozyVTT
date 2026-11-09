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
//
// Each layer fails alone: an error drawing one is logged and the others
// are still drawn that frame, so a token the token layer cannot draw does
// not take a player's fog, walls and pings in the overlay with it.
// ============================================

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { errorSummary } from '@/utils/errors';

export type MapLayer = 'terrain' | 'tokens' | 'overlay';

export function useRenderLoop(drawLayerRef: RefObject<(layer: MapLayer) => void>) {
  const dirtyRef = useRef({ terrain: true, tokens: true, overlay: true });
  const frameRef = useRef<number | null>(null);
  // The error each layer last failed with, logged once while it repeats
  // frame after frame, and again after the layer has drawn in between.
  const failedRef = useRef<Partial<Record<MapLayer, string>>>({});

  const flush = useCallback(() => {
    frameRef.current = null;
    const dirty = dirtyRef.current;
    const draw = drawLayerRef.current;
    if (!draw) return;
    const drawOne = (layer: MapLayer) => {
      dirty[layer] = false;
      try {
        draw(layer);
        delete failedRef.current[layer];
      } catch (error) {
        const summary = errorSummary(error);
        if (failedRef.current[layer] === summary) return;
        failedRef.current[layer] = summary;
        console.error(`The map's ${layer} layer could not be drawn:`, summary);
      }
    };
    // Fixed z-order: terrain → tokens → overlay.
    if (dirty.terrain) drawOne('terrain');
    if (dirty.tokens) drawOne('tokens');
    if (dirty.overlay) drawOne('overlay');
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
