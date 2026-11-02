// ============================================
// CreateMapModal Component
// Modal for DMs to create a new campaign map: from a picture, or drawn in
// CozyVTT (Draw a map), which starts as a blank picture of the size and
// colour chosen (map/paint/drawnMapSize.ts)
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Loader2, ZoomIn, ZoomOut, Sparkles } from 'lucide-react';
import { api } from '@/services/api';
import mapService from '@/services/map.service';
import type { Asset, CampaignMap, CreateMapRequest } from '@/types';
import { AssetType } from '@/types';
import AssetPicker from '@/components/assets/AssetPicker';
import { detectMapGrid, type GridDetectionResult } from '@/utils/detectMapGrid';
import { MAP_LIMITS } from '@/constants/mapLimits';
import { withinMapLimits, feetPerSquareWithinLimits } from '@/utils/mapSize';
import { diagonalStepCosts } from '@/utils/geometry';
import { Button, Modal } from '@/components/ui';
import { apiErrorMessage, errorSummary } from '@/utils/errors';
import { DRAWN_MAP_BACKGROUND, DRAWN_MAP_GRID_SIZE, drawnPictureSize, drawnSizeNote } from './map/paint/drawnMapSize';
import { blankPicture, pictureToPng, releaseCanvas } from './map/paint/blankPicture';
import { PAINT_COLOURS, pickedColour } from './map/paint/paintColours';
import { DrawnPictureRefused, uploadDrawnPicture } from '@/services/drawnPicture';

interface CreateMapModalProps {
  isOpen: boolean;
  campaignId: string;
  onClose: () => void;
  /** The map made, and for a drawn map the picture uploaded for it. */
  onCreated: (map: CampaignMap, drawnPicture?: Asset) => void;
}

/** What a browser that made no PNG of the blank picture is told. */
const NO_PICTURE_MADE = "This browser could not make the map's picture. Choose fewer squares and try again.";

const count = (n: number) => n.toLocaleString('en-US');

// ============================================
// MapPreviewCanvas
// Renders the selected map image with a grid overlay so the DM
// can verify their Width/Height/GridSize settings line up with
// any existing grid baked into the image.
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

    // Clear with parchment background
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

    // Scale the entire map to fit inside PREVIEW_PX, then apply zoom on top
    const baseScale = Math.min(PREVIEW_PX / mapPixelW, PREVIEW_PX / mapPixelH);
    const scale = baseScale * zoom;

    const drawW = mapPixelW * scale;
    const drawH = mapPixelH * scale;
    // Center the scaled map in the preview canvas
    const offsetX = (PREVIEW_PX - drawW) / 2;
    const offsetY = (PREVIEW_PX - drawH) / 2;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!canvasRef.current) return;
      const c = canvasRef.current;
      const cx = c.getContext('2d');
      if (!cx) return;

      // Redraw background (image load is async; state may have changed by now)
      cx.clearRect(0, 0, PREVIEW_PX, PREVIEW_PX);
      cx.fillStyle = '#E8E0D0';
      cx.fillRect(0, 0, PREVIEW_PX, PREVIEW_PX);

      // Map image
      cx.drawImage(img, offsetX, offsetY, drawW, drawH);

      // Grid overlay — clipped to the map bounds so lines don't bleed outside
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
      className="w-full rounded-sm border border-moss-green/30 bg-parchment/50"
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
      {/* TODO(ui): this label is tied to neither the number box nor the slider, so a
          screen reader names the box nothing; give the box an id and the label htmlFor. */}
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
// CreateMapModal
// ============================================

export default function CreateMapModal({
  isOpen,
  campaignId,
  onClose,
  onCreated,
}: CreateMapModalProps) {
  // From a picture, or drawn in CozyVTT.
  const [making, setMaking] = useState<'picture' | 'drawing'>('picture');
  const drawing = making === 'drawing';
  // A drawn map's pixels per square and colour.
  const [detail, setDetail] = useState(DRAWN_MAP_GRID_SIZE);
  const [background, setBackground] = useState(DRAWN_MAP_BACKGROUND);

  // Asset selection
  const [mapAssetId, setMapAssetId] = useState<string | null>(null);
  const [spiritAssetId, setSpiritAssetId] = useState<string | null>(null);

  // Map metadata
  const [name, setName] = useState('');
  const [width, setWidth] = useState(20);
  const [height, setHeight] = useState(20);
  const [gridSize, setGridSize] = useState(50);
  const [feetPreset, setFeetPreset] = useState<'5' | '10' | 'custom'>('5');
  const [feetCustom, setFeetCustom] = useState(5);
  const [diagonalRule, setDiagonalRule] = useState<'flat' | 'alternating'>('flat');

  // Preview zoom (1 = fit-to-preview, higher zooms in)
  const [previewZoom, setPreviewZoom] = useState(1);

  // Auto-detected grid suggestion
  const [detectedGrid, setDetectedGrid] = useState<GridDetectionResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  const feetPerSquare = feetPreset === 'custom' ? feetCustom : parseInt(feetPreset);

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset all state when the modal closes
  useEffect(() => {
    if (!isOpen) {
      setMaking('picture');
      setDetail(DRAWN_MAP_GRID_SIZE);
      setBackground(DRAWN_MAP_BACKGROUND);
      setMapAssetId(null);
      setSpiritAssetId(null);
      setName('');
      setWidth(20);
      setHeight(20);
      setGridSize(50);
      setFeetPreset('5');
      setFeetCustom(5);
      setDiagonalRule('flat');
      setPreviewZoom(1);
      setDetectedGrid(null);
      setIsDetecting(false);
      setError(null);
    }
  }, [isOpen]);

  // When the map image changes, attempt to auto-detect the grid
  useEffect(() => {
    if (!mapAssetId) {
      setDetectedGrid(null);
      return;
    }
    let cancelled = false;
    setIsDetecting(true);
    setDetectedGrid(null);
    detectMapGrid(api.getAssetUrl(mapAssetId, 'maps'))
      .then((result) => {
        if (!cancelled) setDetectedGrid(result);
      })
      .catch(() => { /* detection failure is non-fatal */ })
      .finally(() => { if (!cancelled) setIsDetecting(false); });
    return () => { cancelled = true; };
  }, [mapAssetId]);

  const handleMapAssetSelect = (asset: Asset | null) => {
    setMapAssetId(asset?.id ?? null);
    setPreviewZoom(1); // reset zoom when switching images
  };

  const applyDetectedGrid = () => {
    if (!detectedGrid) return;
    const fitted = withinMapLimits(detectedGrid);
    setWidth(fitted.width);
    setHeight(fitted.height);
    setGridSize(fitted.gridSize);
    setDetectedGrid(null); // dismiss banner after applying
  };

  const handleSpiritAssetSelect = (asset: Asset | null) => {
    setSpiritAssetId(asset?.id ?? null);
  };

  // The picture a drawn map is made with, and what the window says of it.
  const drawnSize = drawnPictureSize(width, height, detail);
  const drawnNote = drawnSizeNote(drawnSize);

  const canSubmit = (drawing ? drawnSize.fits : !!mapAssetId) && name.trim().length > 0 && !isSubmitting;

  const handleClose = useCallback(() => onClose(), [onClose]);

  /**
   * Draw a map: make the blank picture, upload it into the campaign's
   * library tagged drawn-map, then create the map at the pixels per square
   * it is painted at. The picture is one pixel a square, which the map
   * stretches over its grid: one the painted size would be made, sent and
   * decoded for nothing until something is painted, and Paint makes its
   * own at the map's size. A map the server refuses takes its picture with
   * it.
   */
  const handleDraw = async () => {
    if (!canSubmit || !drawnSize.fits) return;
    setIsSubmitting(true);
    setError(null);
    let uploaded: Asset | null = null;
    try {
      const canvas = blankPicture(width, height, background);
      const png = canvas ? await pictureToPng(canvas) : null;
      if (canvas) releaseCanvas(canvas);
      if (!png) {
        setError(NO_PICTURE_MADE);
        return;
      }
      uploaded = await uploadDrawnPicture(png, campaignId);
      const map = await mapService.createMap(campaignId, {
        name: name.trim(),
        imageUrl: uploaded.id,
        width,
        height,
        gridSize: drawnSize.pixelsPerSquare,
        feetPerSquare,
        diagonalRule,
      });
      onCreated(map, uploaded);
      onClose();
    } catch (err: unknown) {
      if (uploaded) {
        const left = uploaded.id;
        // Without force: a picture something else has come to use stays.
        void api.deleteAsset(left).catch((cleanup: unknown) => {
          console.warn('[CreateMapModal] Could not delete the picture of a map not made:', errorSummary(cleanup));
        });
      }
      setError(err instanceof DrawnPictureRefused ? err.message : apiErrorMessage(err) || 'Failed to create map. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (drawing) {
      await handleDraw();
      return;
    }
    if (!canSubmit || !mapAssetId) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const data: CreateMapRequest = {
        name: name.trim(),
        imageUrl: mapAssetId,
        width,
        height,
        gridSize,
        feetPerSquare,
        diagonalRule,
        ...(spiritAssetId ? { spiritLayerUrl: spiritAssetId } : {}),
      };
      const map = await mapService.createMap(campaignId, data);
      onCreated(map);
      onClose();
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
          'Failed to create map. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // URL for the preview canvas — derived from the selected asset ID
  const previewImageUrl = mapAssetId ? api.getAssetUrl(mapAssetId, 'maps') : null;

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={handleClose} title="Create Map" icon={MapPin} size="xl" closeDisabled={isSubmitting}>
            {/* Body */}
            <div className="space-y-6">
              {/* Error */}
              {error && (
                <div role="alert" className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-danger-ink text-sm">
                  {error}
                </div>
              )}

              {/* A picture, or a map drawn here. */}
              <div role="group" aria-label="How to make the map" className="flex gap-2 flex-wrap">
                {([['picture', 'Use a picture'], ['drawing', 'Draw a map']] as const).map(([way, label]) => (
                  <button
                    key={way}
                    type="button"
                    aria-pressed={making === way}
                    onClick={() => setMaking(way)}
                    className={`touch-target px-3 py-1.5 rounded-lg text-sm transition-colors border ${
                      making === way
                        ? 'bg-moss-green text-brand-text border-moss-green'
                        : 'bg-paper-white text-stone-gray border-moss-green/30 hover:border-moss-green/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Map Image. Upload New offers the DM's personal library,
                  selected at first, or the campaign's. Either way players
                  see the picture only once a map using it is on screen; a
                  campaign picture stays with the table if the DM leaves. */}
              {!drawing && (<>
              <AssetPicker
                label="Map Image"
                required
                type={AssetType.MAP}
                searchPlaceholder="Search maps..."
                emptyMessage="No map assets found. Upload a map image to get started."
                selectedAssetId={mapAssetId}
                onSelect={handleMapAssetSelect}
                campaignOption={campaignId}
              />

              {/* Spirit Layer, uploaded the same way */}
              <AssetPicker
                label="Spirit Layer Image (optional)"
                type={AssetType.MAP}
                searchPlaceholder="Search maps..."
                emptyMessage="No map assets found. Upload a map image to get started."
                selectedAssetId={spiritAssetId}
                onSelect={handleSpiritAssetSelect}
                campaignOption={campaignId}
              />
              </>)}

              {/* Map Name */}
              <div>
                <label className="block text-sm font-medium text-stone-gray mb-1">
                  Map Name <span className="text-danger-ink">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Tavern Interior, World Map..."
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
                        min={MAP_LIMITS.minSide}
                        max={MAP_LIMITS.maxSide}
                      />
                      <DimensionField
                        label="Height (grid squares)"
                        value={height}
                        onChange={setHeight}
                        min={MAP_LIMITS.minSide}
                        max={MAP_LIMITS.maxSide}
                      />
                      {drawing ? (
                        <DimensionField
                          label="Detail (pixels per square)"
                          value={detail}
                          onChange={setDetail}
                          min={MAP_LIMITS.minGridSize}
                          max={MAP_LIMITS.maxGridSize}
                        />
                      ) : (
                        <DimensionField
                          label="Grid Size (px/square)"
                          value={gridSize}
                          onChange={setGridSize}
                          min={MAP_LIMITS.minGridSize}
                          max={MAP_LIMITS.maxGridSize}
                        />
                      )}
                    </div>
                    {drawing ? (
                      <>
                        {drawnSize.fits && (
                          <p className="text-xs text-stone-gray/50 mt-2">
                            It is painted at {count(drawnSize.width)} × {count(drawnSize.height)} px.
                          </p>
                        )}
                        {drawnNote && (
                          <p className={`text-xs mt-1 ${drawnSize.fits ? 'text-info-ink' : 'text-danger-ink'}`}>{drawnNote}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-stone-gray/50 mt-2">
                        Canvas will be {width * gridSize}×{height * gridSize}px
                      </p>
                    )}
                  </div>

                  {/* A drawn map's colour, which the eraser paints too. */}
                  {drawing && (
                    <div>
                      <span className="block text-sm font-medium text-stone-gray mb-2">Background colour</span>
                      <div className="flex flex-wrap gap-1.5">
                        {PAINT_COLOURS.map((colour) => (
                          <button
                            key={colour.value}
                            type="button"
                            aria-label={colour.name}
                            aria-pressed={background === colour.value}
                            title={colour.name}
                            onClick={() => setBackground(colour.value)}
                            className="touch-target inline-flex items-center justify-center w-7 h-7"
                          >
                            <span
                              className={`block w-6 h-6 rounded-full border-2 ${background === colour.value ? 'border-brand scale-110' : 'border-stone-gray/40'}`}
                              style={{ backgroundColor: colour.value }}
                            />
                          </button>
                        ))}
                        <label
                          className={`touch-target inline-flex items-center justify-center w-7 h-7 rounded-full ${PAINT_COLOURS.some((c) => c.value === background) ? '' : 'ring-2 ring-brand'}`}
                          title="Another colour"
                        >
                          <input
                            type="color"
                            aria-label="Another colour"
                            value={background}
                            onChange={(e) => {
                              const colour = pickedColour(e.target.value);
                              if (colour) setBackground(colour);
                            }}
                            className="w-6 h-6 cursor-pointer border-0 bg-transparent p-0"
                          />
                        </label>
                      </div>
                    </div>
                  )}

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
                                ? 'bg-moss-green text-brand-text border-moss-green'
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
                              ? 'bg-moss-green text-brand-text border-moss-green'
                              : 'bg-paper-white text-stone-gray border-moss-green/30 hover:border-moss-green/60'
                          }`}
                        >
                          Custom
                        </button>
                        {feetPreset === 'custom' && (
                          <input
                            type="number"
                            value={feetCustom}
                            onChange={(e) => setFeetCustom(feetPerSquareWithinLimits(e.target.value))}
                            min={MAP_LIMITS.minFeetPerSquare}
                            max={MAP_LIMITS.maxFeetPerSquare}
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
                            name="diagonalRule-create"
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
                            name="diagonalRule-create"
                            value="alternating"
                            checked={diagonalRule === 'alternating'}
                            onChange={() => setDiagonalRule('alternating')}
                            className="mt-0.5 accent-moss-green"
                          />
                          <div>
                            {/* At the Grid Scale chosen: 10/20/10/20 ft on 10 ft squares. */}
                            <span className="text-sm text-stone-gray group-hover:text-brand-ink transition-colors">
                              Alternating — {diagonalStepCosts(feetPerSquare, 'alternating').join('/')} ft diagonals
                            </span>
                            <p className="text-xs text-stone-gray/50">Pathfinder 2e default</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Right: Grid Preview + Zoom, or the drawn map's shape and colour ── */}
                {drawing ? (
                  <div className="space-y-3">
                    <span className="block text-sm font-medium text-stone-gray">Preview</span>
                    <div
                      aria-hidden="true"
                      className="w-full max-h-72 rounded-sm border border-moss-green/30 mx-auto"
                      style={{ aspectRatio: `${width} / ${height}`, backgroundColor: background, maxWidth: `calc(18rem * ${width / height})` }}
                    />
                    <p className="text-xs text-stone-gray/50 text-center leading-relaxed">
                      The map opens on your screen only, with Paint on, while your players stay where they are.
                    </p>
                  </div>
                ) : (
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
                    <ZoomOut className="w-4 h-4 text-stone-gray/50 shrink-0" />
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
                    <ZoomIn className="w-4 h-4 text-stone-gray/50 shrink-0" />
                  </div>

                  {/* Auto-detect suggestion banner */}
                  {detectedGrid && (
                    <div className="flex items-start gap-2 p-2.5 bg-warning/10 border border-warning/30 rounded-lg">
                      <Sparkles className="w-4 h-4 text-warning-ink shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-warning-ink">Grid detected</p>
                        <p className="text-xs text-warning-ink mt-0.5">
                          {detectedGrid.width}×{detectedGrid.height} squares · {detectedGrid.gridSize}px/sq
                          <span className="text-warning-ink ml-1">
                            ({Math.round(detectedGrid.confidence * 100)}% confidence)
                          </span>
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={applyDetectedGrid}
                          className="text-xs px-2 py-1 bg-warning/15 border border-warning/30 text-warning-ink rounded-sm hover:bg-warning/25 transition-colors"
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

                  {!isDetecting && !detectedGrid && mapAssetId && (
                    <p className="text-xs text-stone-gray/50 text-center leading-relaxed">
                      No grid detected automatically.<br />Use the sliders to align manually.
                    </p>
                  )}

                  {!mapAssetId && (
                    <p className="text-xs text-stone-gray/50 text-center leading-relaxed">
                      Zoom in to verify the grid aligns<br />with the lines on your map image.
                    </p>
                  )}
                </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-parchment/80 backdrop-blur-xs border-t border-moss-green/20 px-6 py-4 flex items-center justify-end gap-3">
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
                Create Map
              </Button>
            </div>
    </Modal>
  );
}
