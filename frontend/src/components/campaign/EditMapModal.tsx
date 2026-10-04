// ============================================
// EditMapModal Component
// Modal for DMs to edit an existing campaign map
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Loader2, ZoomIn, ZoomOut, Sparkles } from 'lucide-react';
import { api } from '@/services/api';
import mapService from '@/services/map.service';
import type { Asset, Map, UpdateMapRequest } from '@/types';
import { AssetType } from '@/types';
import AssetPicker from '@/components/assets/AssetPicker';
import { detectMapGrid, type GridDetectionResult } from '@/utils/detectMapGrid';
import { Button, Modal } from '@/components/ui';
import { extractAssetId } from '@/utils/assetUrl';

interface EditMapModalProps {
  isOpen: boolean;
  map: Map;
  campaignId: string;
  onClose: () => void;
  onUpdated: (map: Map) => void;
}

// ============================================
// MapPreviewCanvas
// Renders the map image with a grid overlay so the DM can verify
// their Width/Height/GridSize settings line up with the image.
// ============================================

const PREVIEW_PX = 280;

function MapPreviewCanvas({
  imageUrl,
  width,
  height,
  gridSize,
  zoom,
}: {
  imageUrl: string | null;
  width: number;
  height: number;
  gridSize: number;
  zoom: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, PREVIEW_PX, PREVIEW_PX);
    ctx.fillStyle = '#E8E0D0';
    ctx.fillRect(0, 0, PREVIEW_PX, PREVIEW_PX);

    if (!imageUrl) {
      ctx.fillStyle = '#9C8E7A';
      ctx.font = '13px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Select a map image', PREVIEW_PX / 2, PREVIEW_PX / 2 - 10);
      ctx.fillText('to preview the grid', PREVIEW_PX / 2, PREVIEW_PX / 2 + 10);
      return;
    }

    const mapPixelW = width * gridSize;
    const mapPixelH = height * gridSize;
    const baseScale = Math.min(PREVIEW_PX / mapPixelW, PREVIEW_PX / mapPixelH);
    const scale = baseScale * zoom;

    const drawW = mapPixelW * scale;
    const drawH = mapPixelH * scale;
    const offsetX = (PREVIEW_PX - drawW) / 2;
    const offsetY = (PREVIEW_PX - drawH) / 2;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!canvasRef.current) return;
      const c = canvasRef.current;
      const cx = c.getContext('2d');
      if (!cx) return;

      cx.clearRect(0, 0, PREVIEW_PX, PREVIEW_PX);
      cx.fillStyle = '#E8E0D0';
      cx.fillRect(0, 0, PREVIEW_PX, PREVIEW_PX);
      cx.drawImage(img, offsetX, offsetY, drawW, drawH);

      // Grid overlay — clipped to the map bounds
      const cellSize = gridSize * scale;
      cx.save();
      cx.beginPath();
      cx.rect(offsetX, offsetY, drawW, drawH);
      cx.clip();

      cx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      cx.lineWidth = 1;

      for (let x = 0; x <= width; x++) {
        cx.beginPath();
        cx.moveTo(offsetX + x * cellSize, offsetY);
        cx.lineTo(offsetX + x * cellSize, offsetY + drawH);
        cx.stroke();
      }
      for (let y = 0; y <= height; y++) {
        cx.beginPath();
        cx.moveTo(offsetX, offsetY + y * cellSize);
        cx.lineTo(offsetX + drawW, offsetY + y * cellSize);
        cx.stroke();
      }

      cx.restore();
    };
    img.src = imageUrl;
  }, [imageUrl, width, height, gridSize, zoom]);

  return (
    <canvas
      ref={canvasRef}
      width={PREVIEW_PX}
      height={PREVIEW_PX}
      className="w-full rounded border border-moss-green/30 bg-parchment/50"
      style={{ aspectRatio: '1 / 1' }}
      aria-label="Grid alignment preview"
    />
  );
}

// ============================================
// DimensionField
// Number input paired with a range slider for easier adjustment
// ============================================

function DimensionField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div>
      <label className="block text-xs text-stone-gray/70 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(clamp(parseInt(e.target.value) || min))}
        min={min}
        max={max}
        className="input-cozy"
      />
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full mt-1.5 accent-moss-green cursor-pointer"
        aria-label={`${label} slider`}
      />
    </div>
  );
}

// ============================================
// EditMapModal
// ============================================

export default function EditMapModal({
  isOpen,
  map,
  campaignId,
  onClose,
  onUpdated,
}: EditMapModalProps) {
  const [mapAssetId, setMapAssetId] = useState<string | null>(null);
  const [spiritAssetId, setSpiritAssetId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [width, setWidth] = useState(20);
  const [height, setHeight] = useState(20);
  const [gridSize, setGridSize] = useState(50);
  const [feetPreset, setFeetPreset] = useState<'5' | '10' | 'custom'>('5');
  const [feetCustom, setFeetCustom] = useState(5);
  const [diagonalRule, setDiagonalRule] = useState<'flat' | 'alternating'>('flat');
  const [lightingEnabled, setLightingEnabled] = useState(false);
  const [fogEnabled, setFogEnabled] = useState(true);
  const [globalIllumination, setGlobalIllumination] = useState(true);
  const [explorationEnabled, setExplorationEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview zoom (1 = fit-to-preview, higher zooms in)
  const [previewZoom, setPreviewZoom] = useState(1);

  // Auto-detected grid suggestion (only offered when the DM switches to a different image)
  const [detectedGrid, setDetectedGrid] = useState<GridDetectionResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  const feetPerSquare = feetPreset === 'custom' ? feetCustom : parseInt(feetPreset);

  // Pre-fill fields from map prop whenever the modal opens
  useEffect(() => {
    if (isOpen && map) {
      setName(map.name);
      setWidth(map.width);
      setHeight(map.height);
      setGridSize(map.gridSize);
      setMapAssetId(extractAssetId(map.imageUrl));
      setSpiritAssetId(extractAssetId(map.spiritLayerUrl));
      const fps = map.feetPerSquare ?? 5;
      if (fps === 5) setFeetPreset('5');
      else if (fps === 10) setFeetPreset('10');
      else { setFeetPreset('custom'); setFeetCustom(fps); }
      setDiagonalRule((map.diagonalRule as 'flat' | 'alternating') ?? 'flat');
      setLightingEnabled(map.lightingEnabled ?? false);
      setFogEnabled(map.fogEnabled ?? true);
      setGlobalIllumination(map.globalIllumination ?? true);
      setExplorationEnabled(map.explorationEnabled ?? true);
      setPreviewZoom(1);
      setDetectedGrid(null);
      setIsDetecting(false);
      setError(null);
    }
  }, [isOpen, map]);

  // When the map image is swapped to a different one, attempt auto-detection
  // (Don't run on initial open — the existing settings are already correct)
  const initialAssetId = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) { initialAssetId.current = null; return; }
    if (initialAssetId.current === null) {
      initialAssetId.current = mapAssetId; // record the pre-filled ID
      return;
    }
    if (!mapAssetId || mapAssetId === initialAssetId.current) {
      setDetectedGrid(null);
      return;
    }
    let cancelled = false;
    setIsDetecting(true);
    setDetectedGrid(null);
    detectMapGrid(api.getAssetUrl(mapAssetId, 'maps'))
      .then((result) => { if (!cancelled) setDetectedGrid(result); })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setIsDetecting(false); });
    return () => { cancelled = true; };
  }, [mapAssetId, isOpen]);

  const handleMapAssetSelect = (asset: Asset | null) => {
    setMapAssetId(asset?.id ?? null);
    setPreviewZoom(1); // reset zoom when switching images
  };

  const applyDetectedGrid = () => {
    if (!detectedGrid) return;
    setWidth(detectedGrid.width);
    setHeight(detectedGrid.height);
    setGridSize(detectedGrid.gridSize);
    setDetectedGrid(null);
  };

  const handleSpiritAssetSelect = (asset: Asset | null) => {
    setSpiritAssetId(asset?.id ?? null);
  };

  const canSubmit = !!mapAssetId && name.trim().length > 0 && !isSubmitting;

  const handleClose = useCallback(() => onClose(), [onClose]);

  const handleSubmit = async () => {
    if (!canSubmit || !mapAssetId) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const data: UpdateMapRequest = {
        name: name.trim(),
        imageUrl: mapAssetId,
        width,
        height,
        gridSize,
        feetPerSquare,
        diagonalRule,
        spiritLayerUrl: spiritAssetId ?? null,
        lightingEnabled,
        fogEnabled,
        globalIllumination,
        explorationEnabled,
      };
      const updatedMap = await mapService.updateMap(campaignId, map.id, data);
      onUpdated(updatedMap);
      onClose();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to update map. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // URL for the preview canvas — derived from the selected asset ID
  const previewImageUrl = mapAssetId ? api.getAssetUrl(mapAssetId, 'maps') : null;

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={handleClose} title="Edit Map" icon={MapPin} size="xl" closeDisabled={isSubmitting}>
            {/* Body */}
            <div className="space-y-6">
              <p className="text-xs text-ink-muted -mt-4 truncate">{map.name}</p>
              {error && (
                <div role="alert" className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-danger-ink text-sm">
                  {error}
                </div>
              )}

              <AssetPicker
                label="Map Image"
                required
                type={AssetType.MAP}
                allowUpload={false}
                searchPlaceholder="Search maps..."
                emptyMessage="No map assets found. Upload a map image in the Asset Library first."
                selectedAssetId={mapAssetId}
                onSelect={handleMapAssetSelect}
              />

              <AssetPicker
                label="Spirit Layer Image (optional)"
                type={AssetType.MAP}
                allowUpload={false}
                searchPlaceholder="Search maps..."
                emptyMessage="No map assets found. Upload a map image in the Asset Library first."
                selectedAssetId={spiritAssetId}
                onSelect={handleSpiritAssetSelect}
              />

              <div>
                <label className="block text-sm font-medium text-stone-gray mb-1">
                  Map Name <span className="text-danger-ink">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Map name..."
                  className="input-cozy"
                  maxLength={100}
                />
              </div>

              {/* Two-column section: controls (left) + grid preview (right) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">

                {/* ── Left: Dimensions + Grid Settings ── */}
                <div className="space-y-6">

                  {/* Map Dimensions */}
                  <div>
                    <label className="block text-sm font-medium text-stone-gray mb-3">
                      Map Dimensions
                    </label>
                    <div className="space-y-3">
                      <DimensionField
                        label="Width (grid squares)"
                        value={width}
                        onChange={setWidth}
                        min={1}
                        max={500}
                      />
                      <DimensionField
                        label="Height (grid squares)"
                        value={height}
                        onChange={setHeight}
                        min={1}
                        max={500}
                      />
                      <DimensionField
                        label="Grid Size (px/square)"
                        value={gridSize}
                        onChange={setGridSize}
                        min={10}
                        max={500}
                      />
                    </div>
                    <p className="text-xs text-stone-gray/50 mt-2">
                      Canvas will be {width * gridSize}×{height * gridSize}px
                    </p>
                  </div>

                  {/* Grid Settings */}
                  <div className="border border-moss-green/20 rounded-lg p-4 space-y-4 bg-moss-green/5">
                    <h3 className="text-sm font-medium text-brand-ink">Grid Settings</h3>

                    {/* Grid Scale */}
                    <div>
                      <label className="block text-xs font-medium text-stone-gray mb-2">Grid Scale</label>
                      <div className="flex gap-2 flex-wrap">
                        {(['5', '10'] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setFeetPreset(v)}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                              feetPreset === v
                                ? 'bg-moss-green text-paper-white border-moss-green'
                                : 'bg-paper-white text-stone-gray border-moss-green/30 hover:border-moss-green/60'
                            }`}
                          >
                            {v} ft
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setFeetPreset('custom')}
                          className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                            feetPreset === 'custom'
                              ? 'bg-moss-green text-paper-white border-moss-green'
                              : 'bg-paper-white text-stone-gray border-moss-green/30 hover:border-moss-green/60'
                          }`}
                        >
                          Custom
                        </button>
                        {feetPreset === 'custom' && (
                          <input
                            type="number"
                            value={feetCustom}
                            onChange={(e) => setFeetCustom(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                            min={1}
                            max={100}
                            className="input-cozy w-20"
                            placeholder="ft"
                          />
                        )}
                      </div>
                      <p className="text-xs text-stone-gray/50 mt-1">How many feet each grid square represents.</p>
                    </div>

                    {/* Diagonal Movement */}
                    <div>
                      <label className="block text-xs font-medium text-stone-gray mb-2">Diagonal Movement</label>
                      <div className="space-y-2">
                        <label className="flex items-start gap-3 cursor-pointer group">
                          <input
                            type="radio"
                            name="diagonalRule-edit"
                            value="flat"
                            checked={diagonalRule === 'flat'}
                            onChange={() => setDiagonalRule('flat')}
                            className="mt-0.5 accent-moss-green"
                          />
                          <div>
                            <span className="text-sm text-stone-gray group-hover:text-brand-ink transition-colors">
                              Flat — every square costs the same
                            </span>
                            <p className="text-xs text-stone-gray/50">D&D 5e default</p>
                          </div>
                        </label>
                        <label className="flex items-start gap-3 cursor-pointer group">
                          <input
                            type="radio"
                            name="diagonalRule-edit"
                            value="alternating"
                            checked={diagonalRule === 'alternating'}
                            onChange={() => setDiagonalRule('alternating')}
                            className="mt-0.5 accent-moss-green"
                          />
                          <div>
                            <span className="text-sm text-stone-gray group-hover:text-brand-ink transition-colors">
                              Alternating — 5/10/5/10 ft diagonals
                            </span>
                            <p className="text-xs text-stone-gray/50">Pathfinder 2e default</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dynamic Lighting */}
                <div className="mt-3 pt-3 border-t border-stone-gray/20">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={lightingEnabled}
                      onChange={(e) => setLightingEnabled(e.target.checked)}
                      className="w-4 h-4 accent-moss-green"
                      aria-label="Enable dynamic lighting"
                    />
                    <div>
                      <span className="text-sm text-stone-gray group-hover:text-brand-ink transition-colors">
                        Enable Dynamic Lighting
                      </span>
                      <p className="text-xs text-stone-gray/50">Raycasting visibility — players only see what their tokens can see through walls</p>
                    </div>
                  </label>
                </div>

                {/* Fog of War */}
                <div className="mt-3 pt-3 border-t border-stone-gray/20">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={fogEnabled}
                      onChange={(e) => setFogEnabled(e.target.checked)}
                      className="w-4 h-4 accent-moss-green"
                      aria-label="Fog of war on this map"
                    />
                    <div>
                      <span className="text-sm text-stone-gray group-hover:text-brand-ink transition-colors">
                        Fog of War
                      </span>
                      <p className="text-xs text-stone-gray/50">Cover the map and reveal it by hand from the Fog panel. Off, players see the whole map (dynamic lighting still applies)</p>
                    </div>
                  </label>
                </div>

                {/* Global Illumination */}
                <div className="mt-3 pt-3 border-t border-stone-gray/20">
                  <label className={`flex items-center gap-3 group ${lightingEnabled ? 'cursor-pointer' : 'opacity-50'}`}>
                    <input
                      type="checkbox"
                      checked={globalIllumination}
                      disabled={!lightingEnabled}
                      onChange={(e) => setGlobalIllumination(e.target.checked)}
                      className="w-4 h-4 accent-moss-green"
                      aria-label="Global illumination"
                    />
                    <div>
                      <span className="text-sm text-stone-gray group-hover:text-brand-ink transition-colors">
                        Global Illumination
                      </span>
                      <p className="text-xs text-stone-gray/50">Everything in line of sight is lit. Untick to make lights and darkvision matter</p>
                    </div>
                  </label>
                </div>

                {/* Explored memory */}
                <div className="mt-3 pt-3 border-t border-stone-gray/20">
                  <label className={`flex items-center gap-3 group ${lightingEnabled ? 'cursor-pointer' : 'opacity-50'}`}>
                    <input
                      type="checkbox"
                      checked={explorationEnabled}
                      disabled={!lightingEnabled}
                      onChange={(e) => setExplorationEnabled(e.target.checked)}
                      className="w-4 h-4 accent-moss-green"
                      aria-label="Remember explored areas"
                    />
                    <div>
                      <span className="text-sm text-stone-gray group-hover:text-brand-ink transition-colors">
                        Remember Explored Areas
                      </span>
                      <p className="text-xs text-stone-gray/50">Places a player has seen stay on their map, greyed, until they see them again</p>
                    </div>
                  </label>
                </div>

                {/* ── Right: Grid Preview + Zoom ── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-stone-gray">Grid Preview</label>
                    <div className="flex items-center gap-2">
                      {isDetecting && (
                        <span className="flex items-center gap-1 text-xs text-stone-gray/50">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Analysing…
                        </span>
                      )}
                      <span className="text-xs text-stone-gray/50 tabular-nums">{previewZoom.toFixed(2)}×</span>
                    </div>
                  </div>

                  <MapPreviewCanvas
                    imageUrl={previewImageUrl}
                    width={width}
                    height={height}
                    gridSize={gridSize}
                    zoom={previewZoom}
                  />

                  {/* Zoom control */}
                  <div className="flex items-center gap-2">
                    <ZoomOut className="w-4 h-4 text-stone-gray/50 flex-shrink-0" />
                    <input
                      type="range"
                      min="0.1"
                      max="4"
                      step="0.05"
                      value={previewZoom}
                      onChange={(e) => setPreviewZoom(parseFloat(e.target.value))}
                      className="flex-1 accent-moss-green cursor-pointer"
                      aria-label="Preview zoom level"
                    />
                    <ZoomIn className="w-4 h-4 text-stone-gray/50 flex-shrink-0" />
                  </div>

                  {/* Auto-detect suggestion banner — only shown when image is changed */}
                  {detectedGrid && (
                    <div className="flex items-start gap-2 p-2.5 bg-warning/10 border border-warning/30 rounded-lg">
                      <Sparkles className="w-4 h-4 text-warning-ink flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-warning-ink">Grid detected</p>
                        <p className="text-xs text-warning-ink mt-0.5">
                          {detectedGrid.width}×{detectedGrid.height} squares · {detectedGrid.gridSize}px/sq
                          <span className="text-warning-ink ml-1">
                            ({Math.round(detectedGrid.confidence * 100)}% confidence)
                          </span>
                        </p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={applyDetectedGrid}
                          className="text-xs px-2 py-1 bg-warning text-white rounded hover:bg-warning transition-colors"
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetectedGrid(null)}
                          className="text-xs px-2 py-1 text-warning-ink hover:text-warning-ink transition-colors"
                          aria-label="Dismiss suggestion"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-stone-gray/50 text-center leading-relaxed">
                    Zoom in to verify the grid aligns<br />with the lines on your map image.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-parchment/80 backdrop-blur-sm border-t border-moss-green/20 px-6 py-4 flex items-center justify-end gap-3">
              <Button
                type="button"
                onClick={onClose}
                variant="secondary"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
    </Modal>
  );
}
