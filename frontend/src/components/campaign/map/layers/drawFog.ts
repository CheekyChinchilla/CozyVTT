// ============================================
// Manual fog-of-war layer (the non-dynamic-lighting fog).
// DM sees semi-transparent fog from the full fogState; players see opaque
// fog everywhere outside their revealed cell set: nothing under an
// unrevealed cell shows through, not the artwork and not what stands on it.
// Pure: no React, no component closures.
// ============================================

import type { FogState } from '@/types/walls';
import type { Viewport } from './types';

export interface FogDrawState {
  isDM: boolean;
  /** Full fog grid — DM only. */
  fogState: FogState | null;
  /** Revealed cell indices — players only; null = no fog to draw. */
  revealedCells: Set<number> | null;
  /**
   * Cells left clear whatever the revealed set says — the ones a player's own
   * tokens stand on. Players always see their own tokens; the fog that covers
   * the overlay must not paint over them.
   */
  exemptCells?: ReadonlySet<number>;
  /**
   * The fog left over a cell that has just been revealed, as it fades out:
   * 1 = still full, falling to 0. A hidden cell is always drawn full.
   */
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
        const fade = revealed[idx] ? state.revealOpacity.get(idx) : undefined;
        if (revealed[idx] && fade === undefined) continue;
        ctx.fillStyle = fade === undefined ? 'rgba(15, 12, 25, 0.55)' : `rgba(15, 12, 25, ${0.55 * fade})`;
        ctx.fillRect(col * cellPx, row * cellPx, cellPx, cellPx);
      }
    }
    ctx.restore();
  }

  // Player fog (opaque, from revealedCells; cells are one per grid square)
  if (!state.isDM && state.revealedCells) {
    const cellPx = viewport.gridSize;
    const fogCols = viewport.mapWidth;
    const fogRows = viewport.mapHeight;
    ctx.save();
    for (let row = 0; row < fogRows; row++) {
      for (let col = 0; col < fogCols; col++) {
        const idx = row * fogCols + col;
        if (state.exemptCells?.has(idx)) continue;
        const fade = state.revealedCells.has(idx) ? state.revealOpacity.get(idx) : undefined;
        if (state.revealedCells.has(idx) && fade === undefined) continue;
        ctx.fillStyle = fade === undefined ? 'rgba(15, 12, 25, 1)' : `rgba(15, 12, 25, ${fade})`;
        ctx.fillRect(col * cellPx, row * cellPx, cellPx, cellPx);
      }
    }
    ctx.restore();
  }
}
