// ============================================
// Background planes — the map image (Material Plane) and the spirit
// layer image (Ethereal Plane) with the DM/player alpha model.
//
// These are two separate draw calls because grid + manual fog render
// BETWEEN them in the pipeline (spirit imagery covers fog for viewers
// in the spirit realm).
// Pure: no React, no component closures.
// ============================================

import { mapSizePx, type Viewport } from './types';

export interface MapImageDrawState {
  mapImage: CanvasImageSource;
  /** Campaign-wide spirit toggle. */
  spiritActive: boolean;
  isDM: boolean;
  dmViewBothPlanes: boolean;
}

export function drawMapImage(
  ctx: CanvasRenderingContext2D,
  state: MapImageDrawState,
  viewport: Viewport
): void {
  const { w: mapWidthPx, h: mapHeightPx } = mapSizePx(viewport);

  // Skip when DM is in single-plane mode and the spirit realm is currently
  // active — in that case only the spirit layer image is drawn.
  const dmSinglePlaneSpirit = state.isDM && !state.dmViewBothPlanes && state.spiritActive;
  if (!dmSinglePlaneSpirit) {
    ctx.drawImage(state.mapImage, 0, 0, mapWidthPx, mapHeightPx);
  }
}

export interface SpiritLayerDrawState {
  spiritLayerImage: CanvasImageSource;
  /** Fade multiplier during spirit toggle transitions (0..1). */
  spiritLayerOpacity: number;
  spiritActive: boolean;
  /** Viewer is in the spirit realm (global toggle OR personal crossing). */
  isInSpiritRealm: boolean;
  isDM: boolean;
  dmViewBothPlanes: boolean;
}

/**
 * Spirit layer image alpha model:
 *   DM single-plane: only the active plane, full fidelity
 *   DM dual-plane, spirit hidden from players: ghostly hint (0.32)
 *   DM dual-plane, spirit active: both planes (0.72)
 *   Player in spirit realm: spirit dominates (0.88)
 */
export function drawSpiritLayer(
  ctx: CanvasRenderingContext2D,
  state: SpiritLayerDrawState,
  viewport: Viewport
): void {
  const { w: mapWidthPx, h: mapHeightPx } = mapSizePx(viewport);

  let alpha = 0;
  if (state.isDM && !state.dmViewBothPlanes) {
    alpha = state.spiritActive ? 1.0 : 0;
  } else if (state.isDM && !state.spiritActive) {
    alpha = 0.32;
  } else if (state.isDM && state.spiritActive) {
    alpha = 0.72;
  } else if (!state.isDM && state.isInSpiritRealm) {
    alpha = 0.88;
  }

  if (alpha > 0) {
    ctx.save();
    ctx.globalAlpha = alpha * state.spiritLayerOpacity;
    ctx.drawImage(state.spiritLayerImage, 0, 0, mapWidthPx, mapHeightPx);
    ctx.restore();
  }
}
