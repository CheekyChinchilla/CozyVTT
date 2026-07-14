// ============================================
// Grid overlay layer.
// Pure: no React, no component closures.
// ============================================

import { mapSizePx, type Viewport } from './types';

export interface GridDrawState {
  gridColor: 'black' | 'white';
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  state: GridDrawState,
  viewport: Viewport
): void {
  const { w: mapWidthPx, h: mapHeightPx } = mapSizePx(viewport);

  ctx.strokeStyle = state.gridColor === 'black' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 2 / viewport.zoom; // constant on-screen width regardless of zoom

  // Vertical lines
  for (let x = 0; x <= viewport.mapWidth; x++) {
    const xPos = x * viewport.gridSize;
    ctx.beginPath();
    ctx.moveTo(xPos, 0);
    ctx.lineTo(xPos, mapHeightPx);
    ctx.stroke();
  }

  // Horizontal lines
  for (let y = 0; y <= viewport.mapHeight; y++) {
    const yPos = y * viewport.gridSize;
    ctx.beginPath();
    ctx.moveTo(0, yPos);
    ctx.lineTo(mapWidthPx, yPos);
    ctx.stroke();
  }
}
