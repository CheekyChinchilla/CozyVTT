// ============================================
// useMapControls Hook
// Manages zoom, pan, and coordinate conversions for map canvas
// ============================================

import { useState, useCallback, useRef } from 'react';
import { flipGridY } from '@/components/campaign/map/coords';

interface MapControlsConfig {
  /** Grid size in pixels (e.g., 50 means each grid cell is 50x50 pixels at 1x zoom) */
  gridSize: number;
  /** Map width in grid cells */
  mapWidth: number;
  /** Map height in grid cells */
  mapHeight: number;
  /** Minimum zoom level */
  minZoom?: number;
  /** Maximum zoom level */
  maxZoom?: number;
}

interface GridCoordinates {
  x: number;
  y: number;
}

interface ScreenCoordinates {
  x: number;
  y: number;
}

interface PanOffset {
  x: number;
  y: number;
}

export function useMapControls(config: MapControlsConfig) {
  const {
    gridSize,
    mapWidth,
    mapHeight,
    minZoom = 0.5,
    maxZoom = 3,
  } = config;

  // State
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 });

  // Refs for drag tracking
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<ScreenCoordinates>({ x: 0, y: 0 });
  const panStartRef = useRef<PanOffset>({ x: 0, y: 0 });

  /**
   * Clamp zoom level to min/max bounds
   */
  const clampZoom = useCallback(
    (value: number): number => {
      return Math.max(minZoom, Math.min(maxZoom, value));
    },
    [minZoom, maxZoom]
  );

  /**
   * Zoom in by 0.25
   */
  const zoomIn = useCallback(() => {
    setZoom((prev) => clampZoom(prev + 0.25));
  }, [clampZoom]);

  /**
   * Zoom out by 0.25
   */
  const zoomOut = useCallback(() => {
    setZoom((prev) => clampZoom(prev - 0.25));
  }, [clampZoom]);

  /**
   * Set zoom to specific value
   */
  const setZoomLevel = useCallback(
    (value: number) => {
      setZoom(clampZoom(value));
    },
    [clampZoom]
  );

  /**
   * Fit the entire map within the canvas, centered with a small margin.
   * This is the preferred "reset view" for map switches and the Reset button.
   */
  const fitToScreen = useCallback(
    (canvasWidth: number, canvasHeight: number) => {
      if (!canvasWidth || !canvasHeight) return;

      const mapWidthPx = mapWidth * gridSize;
      const mapHeightPx = mapHeight * gridSize;
      if (!mapWidthPx || !mapHeightPx) return;

      // Scale down to fit entirely inside the canvas with a 5% margin on each side
      const fitZoom = clampZoom(
        Math.min(
          (canvasWidth * 0.9) / mapWidthPx,
          (canvasHeight * 0.9) / mapHeightPx
        )
      );

      // Center the scaled map in the canvas
      const panX = (canvasWidth - mapWidthPx * fitZoom) / 2;
      const panY = (canvasHeight - mapHeightPx * fitZoom) / 2;

      setZoom(fitZoom);
      setPanOffset({ x: panX, y: panY });
    },
    [mapWidth, mapHeight, gridSize, clampZoom]
  );

  /**
   * Reset zoom to 1x and center pan (legacy — prefer fitToScreen)
   */
  const resetView = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  /**
   * Handle mouse wheel zoom
   * Zooms towards mouse cursor position
   */
  const handleWheel = useCallback(
    (e: WheelEvent, canvasRect: DOMRect) => {
      e.preventDefault();

      // Calculate mouse position relative to canvas
      const mouseX = e.clientX - canvasRect.left;
      const mouseY = e.clientY - canvasRect.top;

      // Calculate zoom delta (0.1 per wheel notch)
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = clampZoom(zoom + delta);

      // Zoom towards the cursor: the world coordinate under the mouse must stay fixed.
      // Invariant: (mouseX - panX) / zoom = (mouseX - newPanX) / newZoom
      // Solving: newPanX = mouseX + (panX - mouseX) * (newZoom / zoom)
      const scale = newZoom / zoom;
      const newPanX = mouseX + (panOffset.x - mouseX) * scale;
      const newPanY = mouseY + (panOffset.y - mouseY) * scale;

      setZoom(newZoom);
      setPanOffset({ x: newPanX, y: newPanY });
    },
    [zoom, panOffset, clampZoom]
  );

  /**
   * Start dragging (pan)
   */
  const startDrag = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      panStartRef.current = { ...panOffset };
    },
    [panOffset]
  );

  /**
   * Handle drag movement (pan)
   */
  const handleDrag = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!isDraggingRef.current) return;

    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    setPanOffset({
      x: panStartRef.current.x + deltaX,
      y: panStartRef.current.y + deltaY,
    });
  }, []);

  /**
   * Stop dragging (pan)
   */
  const stopDrag = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  /**
   * Convert screen coordinates to grid coordinates
   * Screen coords = mouse position on canvas
   * Grid coords = grid cell position (0,0 = bottom-left, following D&D/VTT convention)
   */
  const screenToGrid = useCallback(
    (screen: ScreenCoordinates): GridCoordinates => {
      // Remove pan offset and zoom to get world coordinates
      const worldX = (screen.x - panOffset.x) / zoom;
      const worldY = (screen.y - panOffset.y) / zoom;

      // Convert world coordinates to grid coordinates (top-left based)
      const gridX = Math.floor(worldX / gridSize);
      const gridYFromTop = Math.floor(worldY / gridSize);

      // Invert Y to use bottom-left origin (D&D/VTT standard) — see map/coords.ts
      const gridY = flipGridY(gridYFromTop, mapHeight);

      return { x: gridX, y: gridY };
    },
    [zoom, panOffset, gridSize, mapHeight]
  );

  /**
   * Convert grid coordinates to screen coordinates
   * Grid coords = grid cell position (0,0 = bottom-left)
   * Screen coords = top-left pixel position on canvas (accounting for zoom and pan)
   */
  const gridToScreen = useCallback(
    (grid: GridCoordinates): ScreenCoordinates => {
      // Convert bottom-left grid Y to top-left world Y (flipGridY is its own inverse)
      const gridYFromTop = flipGridY(grid.y, mapHeight);

      // Convert grid coordinates to world coordinates (top-left of cell)
      const worldX = grid.x * gridSize;
      const worldY = gridYFromTop * gridSize;

      // Apply zoom and pan to get screen coordinates
      const screenX = worldX * zoom + panOffset.x;
      const screenY = worldY * zoom + panOffset.y;

      return { x: screenX, y: screenY };
    },
    [zoom, panOffset, gridSize, mapHeight]
  );

  /**
   * Check if grid coordinates are within map bounds
   */
  const isWithinBounds = useCallback(
    (grid: GridCoordinates): boolean => {
      return grid.x >= 0 && grid.x < mapWidth && grid.y >= 0 && grid.y < mapHeight;
    },
    [mapWidth, mapHeight]
  );

  /**
   * Get current scaled grid size (accounting for zoom)
   */
  const getScaledGridSize = useCallback((): number => {
    return gridSize * zoom;
  }, [gridSize, zoom]);

  return {
    // State
    zoom,
    panOffset,
    isDragging: isDraggingRef.current,

    // Zoom controls
    zoomIn,
    zoomOut,
    setZoomLevel,
    fitToScreen,
    resetView,

    // Pan controls
    startDrag,
    handleDrag,
    stopDrag,

    // Coordinate conversion
    screenToGrid,
    gridToScreen,
    isWithinBounds,
    getScaledGridSize,

    // Event handlers
    handleWheel,

    // Bounds
    minZoom,
    maxZoom,
  };
}
