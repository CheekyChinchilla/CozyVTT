// ============================================
// Manual fog-of-war layer (the non-dynamic-lighting fog).
// DM sees semi-transparent fog from the full fogState; players see
// near-opaque fog everywhere outside their revealed cell set.
// Pure: no React, no component closures.
// ============================================

import type { FogState } from '@/types/walls';
import type { Viewport } from './types';

export interface FogDrawState {
  isDM: boolean;
  /** Full fog grid — DM only. */
  fogState: FogState | null;
  /** Revealed cell indices — players only; null = fog data not received yet. */
  revealedCells: Set<number> | null;
  /** Per-cell reveal-fade opacity (1 = just revealed → 0 = faded in). */
  revealOpacity: ReadonlyMap<number, number>;
}

export function drawFog(
  ctx: CanvasRenderingContext2D,
  state: FogDrawState,
  viewport: Viewport
): void {
  // DM fog (semi-transparent, from full fogState)
  if (state.isDM && state.fogState) {
    const { fogCols, fogRows, cellPx, revealed } = state.fogState;
    ctx.save();
    ctx.fillStyle = 'rgba(15, 12, 25, 0.55)'; // deep dark purple, semi-transparent for DM
    for (let row = 0; row < fogRows; row++) {
      for (let col = 0; col < fogCols; col++) {
        const idx = row * fogCols + col;
        if (!revealed[idx]) {
          const fadeOpacity = state.revealOpacity.get(idx);
          if (fadeOpacity !== undefined) {
            ctx.fillStyle = `rgba(15, 12, 25, ${0.55 * fadeOpacity})`;
            ctx.fillRect(col * cellPx, row * cellPx, cellPx, cellPx);
            ctx.fillStyle = 'rgba(15, 12, 25, 0.55)';
          } else {
            ctx.fillRect(col * cellPx, row * cellPx, cellPx, cellPx);
          }
        }
      }
    }
    ctx.restore();
  }

  // Player fog (near-opaque, from revealedCells; cells are one per grid square)
  if (!state.isDM && state.revealedCells) {
    const cellPx = viewport.gridSize;
    const fogCols = viewport.mapWidth;
    const fogRows = viewport.mapHeight;
    ctx.save();
    for (let row = 0; row < fogRows; row++) {
      for (let col = 0; col < fogCols; col++) {
        const idx = row * fogCols + col;
        if (!state.revealedCells.has(idx)) {
          const fadeOpacity = state.revealOpacity.get(idx);
          ctx.fillStyle = fadeOpacity !== undefined
            ? `rgba(15, 12, 25, ${0.95 * fadeOpacity})`
            : 'rgba(15, 12, 25, 0.95)';
          ctx.fillRect(col * cellPx, row * cellPx, cellPx, cellPx);
        }
      }
    }
    ctx.restore();
  }
}
