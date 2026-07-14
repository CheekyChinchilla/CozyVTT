// ============================================
// Wall layer — wall/door/window segments, door state indicators,
// DM endpoint/junction nodes, player line-of-sight door filtering.
// Pure: no React, no component closures.
// ============================================

import type { WallSegment } from '@/types/walls';
import { isPointVisible } from '@/utils/raycasting';
import type { Viewport } from './types';
import type { VisionSource } from '../vision';

export interface WallsDrawState {
  wallSegments: readonly WallSegment[];
  isDM: boolean;
  /** DM-selected color for plain walls (doors/windows use fixed colors). */
  wallColor: string;
  hoveredWallId: string | null;
  selectedWallId: string | null;
  hoveredDoorId: string | null;
  /** Show endpoint/junction nodes (any wall tool active). */
  showEndpoints: boolean;
  /** Endpoint currently being dragged (select mode). */
  dragEndpoint: { x: number; y: number } | null;
  selectedEndpoint: { x: number; y: number } | null;
  /** Dynamic lighting on → player doors filtered by line of sight. */
  lightingEnabled: boolean;
  /** Viewer vision polygons (empty when not applicable). */
  visPolygons: readonly VisionSource[];
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function drawWallSegment(
  ctx: CanvasRenderingContext2D,
  seg: WallSegment,
  zoom: number,
  wallColor: string,
  isHovered = false,
  isPending = false
): void {
  // Thicker lines (4px base) — walls need to be clearly visible over map imagery
  ctx.lineWidth = (isHovered ? 7 : 4) / zoom;
  if (isPending) {
    ctx.strokeStyle = 'rgba(253, 230, 138, 0.85)'; // amber-100 dashed = pending
    ctx.setLineDash([5 / zoom, 5 / zoom]);
  } else {
    ctx.setLineDash([]);
    // DM-selected color for walls; fixed colors for doors/windows (functional indicators)
    switch (seg.type) {
      case 'wall':        ctx.strokeStyle = hexToRgba(wallColor, isHovered ? 1 : 0.9); break;
      case 'door-closed': ctx.strokeStyle = isHovered ? 'rgba(196, 181, 253, 1)' : 'rgba(167, 139, 250, 0.9)'; break;
      case 'door-open':   ctx.strokeStyle = isHovered ? 'rgba(187, 247, 208, 1)' : 'rgba(134, 239, 172, 0.9)'; break;
      case 'door-locked': ctx.strokeStyle = isHovered ? 'rgba(252, 165, 165, 1)' : 'rgba(239, 68, 68, 0.9)'; break;
      case 'window':      ctx.strokeStyle = 'rgba(147, 197, 253, 0.9)'; break;
    }
    if (seg.type === 'door-open')  ctx.setLineDash([6 / zoom, 4 / zoom]);
    if (seg.type === 'window')     ctx.setLineDash([2 / zoom, 3 / zoom]);
  }
  ctx.beginPath();
  ctx.moveTo(seg.x1, seg.y1);
  ctx.lineTo(seg.x2, seg.y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Door center indicator (filled circle = closed, arc = open, cross = locked)
  if ((seg.type === 'door-closed' || seg.type === 'door-open' || seg.type === 'door-locked') && !isPending) {
    const mx = (seg.x1 + seg.x2) / 2;
    const my = (seg.y1 + seg.y2) / 2;
    if (seg.type === 'door-closed') {
      ctx.fillStyle = isHovered ? 'rgba(196, 181, 253, 1)' : 'rgba(167, 139, 250, 0.9)';
      ctx.beginPath();
      ctx.arc(mx, my, 5 / zoom, 0, Math.PI * 2);
      ctx.fill();
    } else if (seg.type === 'door-locked') {
      // locked: filled red circle with a small cross
      ctx.fillStyle = isHovered ? 'rgba(252, 165, 165, 1)' : 'rgba(239, 68, 68, 0.9)';
      ctx.beginPath();
      ctx.arc(mx, my, 5 / zoom, 0, Math.PI * 2);
      ctx.fill();
      const sz = 2.5 / zoom;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(mx - sz, my - sz); ctx.lineTo(mx + sz, my + sz);
      ctx.moveTo(mx + sz, my - sz); ctx.lineTo(mx - sz, my + sz);
      ctx.stroke();
    } else {
      // open door: small arc showing swing
      ctx.strokeStyle = isHovered ? 'rgba(187, 247, 208, 1)' : 'rgba(134, 239, 172, 0.9)';
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(mx, my, 6 / zoom, 0, Math.PI);
      ctx.stroke();
    }
  }
}

export function drawWalls(
  ctx: CanvasRenderingContext2D,
  state: WallsDrawState,
  viewport: Viewport
): void {
  const { zoom } = viewport;

  ctx.save();
  ctx.lineCap = 'round';

  if (state.isDM) {
    // DM sees all walls
    for (const seg of state.wallSegments) {
      drawWallSegment(ctx, seg, zoom, state.wallColor, seg.id === state.hoveredWallId || seg.id === state.selectedWallId);
    }
    // Endpoint/junction nodes — shown whenever a wall tool is active.
    // White dot = dangling endpoint; larger yellow dot = junction (≥2 segments share the point).
    if (state.showEndpoints) {
      const endpointMap = new Map<string, { x: number; y: number; count: number }>();
      for (const seg of state.wallSegments) {
        for (const pt of [{ x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }]) {
          const key = `${Math.round(pt.x)},${Math.round(pt.y)}`;
          const existing = endpointMap.get(key);
          if (existing) {
            existing.count++;
          } else {
            endpointMap.set(key, { x: pt.x, y: pt.y, count: 1 });
          }
        }
      }
      ctx.save();
      const dragPt = state.dragEndpoint;
      const selEp = state.selectedEndpoint;
      for (const { x, y, count } of endpointMap.values()) {
        const isJunction = count >= 2;
        const isDragging = dragPt && Math.abs(x - Math.round(dragPt.x)) < 1 && Math.abs(y - Math.round(dragPt.y)) < 1;
        const isSelected = selEp && Math.abs(x - selEp.x) < 1 && Math.abs(y - selEp.y) < 1;
        const radius = (isDragging || isSelected ? 6 : isJunction ? 4.5 : 3) / zoom;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isDragging ? 'rgba(56, 189, 248, 0.95)' : isSelected ? 'rgba(56, 189, 248, 0.9)' : isJunction ? 'rgba(253, 224, 71, 0.9)' : 'rgba(255,255,255,0.6)';
        ctx.strokeStyle = isDragging || isSelected ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)';
        ctx.lineWidth = (isDragging || isSelected ? 2 : 1) / zoom;
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  } else {
    // Players see door segments within line-of-sight only.
    // When dynamic lighting is off, all doors are always visible.
    for (const seg of state.wallSegments) {
      if (seg.type === 'door-closed' || seg.type === 'door-open' || seg.type === 'door-locked') {
        if (state.lightingEnabled && state.visPolygons.length > 0) {
          const midX = (seg.x1 + seg.x2) / 2;
          const midY = (seg.y1 + seg.y2) / 2;
          // Closed doors lie exactly ON the visibility polygon boundary — a raw
          // midpoint test is unreliable. Nudge 2px toward the viewer so the test
          // point is safely inside the visible area.
          const inSight = state.visPolygons.some(({ poly, cx, cy }) => {
            const dx = cx - midX;
            const dy = cy - midY;
            const dist = Math.hypot(dx, dy) || 1;
            return isPointVisible(
              { x: midX + (dx / dist) * 2, y: midY + (dy / dist) * 2 },
              { x: 0, y: 0 },
              poly
            );
          });
          if (!inSight) continue;
        }
        drawWallSegment(ctx, seg, zoom, state.wallColor, seg.id === state.hoveredDoorId);
      }
    }
    // When dynamic lighting is OFF, also render wall/window segments so players
    // can understand the terrain. When lighting is ON, the darkness IS the wall indicator.
    if (!state.lightingEnabled) {
      for (const seg of state.wallSegments) {
        if (seg.type === 'wall' || seg.type === 'window') {
          drawWallSegment(ctx, seg, zoom, state.wallColor, false);
        }
      }
    }
  }

  ctx.restore();
}
