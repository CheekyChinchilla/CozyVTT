// ============================================
// Map animation hooks — the rAF loops that advance canvas animations
// outside React's render cycle.
//
// Each hook takes an `onTick` callback invoked once per animation
// frame; MapCanvas passes a `markDirty(...)` call so the loop only
// repaints the layer(s) the animation touches (token tweens → the
// tokens layer; fog reveal fade → the terrain layer). The callback is
// stored in a latest-ref so the loop always calls the newest closure
// without re-subscribing the frame on every render.
// ============================================

import { useEffect, useRef, useState } from 'react';
import type { FogState } from '@/types/walls';
import type { TokenAnimation } from './layers/types';

/**
 * Smooth token-movement tweens. `token.moved` handlers seed a tween via
 * `setAnimatingTokens`; the loop advances the interpolation each frame
 * (the draw layer reads startTime/duration at frame time) and prunes
 * finished tweens.
 */
export function useTokenAnimation(onTick: () => void) {
  const [animatingTokens, setAnimatingTokens] = useState<Map<string, TokenAnimation>>(new Map());
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  useEffect(() => {
    if (animatingTokens.size === 0) return;

    let animationFrameId: number;

    const animate = () => {
      const now = Date.now();
      const updatedAnimations = new Map(animatingTokens);
      let needsUpdate = false;

      for (const [tokenId, animation] of updatedAnimations.entries()) {
        const elapsed = now - animation.startTime;
        if (elapsed >= animation.duration) {
          updatedAnimations.delete(tokenId);
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        setAnimatingTokens(updatedAnimations);
      }

      // Advance the on-canvas interpolation for this frame.
      tickRef.current();

      if (updatedAnimations.size > 0) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [animatingTokens]);

  return { animatingTokens, setAnimatingTokens };
}

/**
 * Fog reveal fade — decays per-cell reveal opacity over ~400ms and
 * repaints while any cell is still fading. Socket handlers seed the
 * returned map with 1.0 for newly-revealed cells; the fog draw layer
 * reads it for the fade alpha. Re-subscribes when fog state changes so
 * newly-seeded cells restart the loop.
 */
export function useFogRevealAnimation(
  onTick: () => void,
  fogState: FogState | null,
  revealedCells: Set<number> | null
) {
  const revealOpacityRef = useRef<Map<number, number>>(new Map());
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  useEffect(() => {
    if (revealOpacityRef.current.size === 0) return;

    let animationFrameId: number;

    const animateFog = () => {
      let hasActive = false;
      revealOpacityRef.current.forEach((opacity, idx) => {
        const next = opacity - 0.042; // ~400ms to fully fade at 60fps
        if (next <= 0) {
          revealOpacityRef.current.delete(idx);
        } else {
          revealOpacityRef.current.set(idx, next);
          hasActive = true;
        }
      });

      tickRef.current();

      if (hasActive) {
        animationFrameId = requestAnimationFrame(animateFog);
      }
    };

    animationFrameId = requestAnimationFrame(animateFog);
    return () => { cancelAnimationFrame(animationFrameId); };
  }, [fogState, revealedCells]); // re-subscribe when fog changes

  return revealOpacityRef;
}

/** Milliseconds between turn-pulse repaints (~30fps). */
const PULSE_FRAME_MS = 33;

/**
 * Turn-highlight pulse — a self-sustaining loop that repaints the token
 * layer while a combatant is acting, so the active-token ring can breathe.
 *
 * Unlike the other two hooks there is no finite work queue to drain: the
 * pulse runs for as long as `active` stays true, so the caller is
 * responsible for passing `false` when combat ends (and when the user
 * prefers reduced motion, in which case the ring is drawn statically and
 * no loop is started at all).
 *
 * Ticks are gated to ~30fps rather than the display rate. The cycle is
 * 1.6s, so half the frames are visually indistinguishable, and this
 * repaints the map's hot layer for the whole of a combat — worth halving.
 */
export function useTurnPulseAnimation(active: boolean, onTick: () => void) {
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  useEffect(() => {
    if (!active) return;

    let animationFrameId: number;
    let lastTick = 0;

    const animate = (timestamp: number) => {
      if (timestamp - lastTick >= PULSE_FRAME_MS) {
        lastTick = timestamp;
        tickRef.current();
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(animationFrameId); };
  }, [active]);
}

/** Full period of one breath, in milliseconds. */
const PULSE_PERIOD_MS = 1600;

/**
 * Pulse phase in [0, 1] for a given frame time — 0 at the tightest point
 * of the breath, 1 at the widest. Pure, so the draw layer stays testable:
 * pass a fixed `now` and the geometry is deterministic.
 */
export function pulsePhaseAt(now: number): number {
  return 0.5 - 0.5 * Math.cos((now % PULSE_PERIOD_MS) / PULSE_PERIOD_MS * Math.PI * 2);
}
