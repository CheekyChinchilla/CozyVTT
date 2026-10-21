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

/**
 * Fill whole fog cells as one shape. Squares filled one by one each leave
 * their edge part-painted where it falls between screen pixels, and two
 * part-painted edges side by side let the picture under the fog through as a
 * hairline: the walls and the grid, which lie on those edges. One path holds
 * no edge between neighbouring cells.
 */
function fillCells(ctx: CanvasRenderingContext2D, cells: readonly number[], cols: number, cellPx: number, style: string): void {
  if (cells.length === 0) return;
  ctx.beginPath();
  for (const idx of cells) {
    ctx.rect((idx % cols) * cellPx, Math.floor(idx / cols) * cellPx, cellPx, cellPx);
  }
  ctx.fillStyle = style;
  ctx.fill();
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
    const hidden: number[] = [];
    for (let row = 0; row < fogRows; row++) {
      for (let col = 0; col < fogCols; col++) {
        const idx = row * fogCols + col;
        if (!revealed[idx]) { hidden.push(idx); continue; }
        const fade = state.revealOpacity.get(idx);
        if (fade === undefined) continue;
        ctx.fillStyle = `rgba(15, 12, 25, ${0.55 * fade})`;
        ctx.fillRect(col * cellPx, row * cellPx, cellPx, cellPx);
      }
    }
    // Deep dark purple, semi-transparent for the DM
    fillCells(ctx, hidden, fogCols, cellPx, 'rgba(15, 12, 25, 0.55)');
    ctx.restore();
  }

  // Player fog (opaque, from revealedCells; cells are one per grid square)
  if (!state.isDM && state.revealedCells) {
    const cellPx = viewport.gridSize;
    const fogCols = viewport.mapWidth;
    const fogRows = viewport.mapHeight;
    ctx.save();
    const hidden: number[] = [];
    for (let row = 0; row < fogRows; row++) {
      for (let col = 0; col < fogCols; col++) {
        const idx = row * fogCols + col;
        if (state.exemptCells?.has(idx)) continue;
        if (!state.revealedCells.has(idx)) { hidden.push(idx); continue; }
        const fade = state.revealOpacity.get(idx);
        if (fade === undefined) continue;
        ctx.fillStyle = `rgba(15, 12, 25, ${fade})`;
        ctx.fillRect(col * cellPx, row * cellPx, cellPx, cellPx);
      }
    }
    fillCells(ctx, hidden, fogCols, cellPx, 'rgba(15, 12, 25, 1)');
    ctx.restore();
  }
}
