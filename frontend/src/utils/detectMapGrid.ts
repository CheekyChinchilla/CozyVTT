// ============================================
// detectMapGrid
// Client-side grid detection using autocorrelation on
// grayscale projection profiles.
//
// How it works:
//   1. Downsample the image to at most 512px for performance.
//   2. Convert to grayscale and compute column-sum and row-sum
//      projection profiles (one brightness value per column/row).
//   3. Run 1D autocorrelation on each profile.
//      A regular grid of lines produces a strong periodic signal;
//      the lag at the first autocorrelation peak = grid period in px.
//   4. Scale the detected period back to the original image size.
//   5. Derive width/height grid square counts from the period.
//
// Works well on maps that have visible grid lines baked in.
// Returns null (silently) when no clear grid is found.
// ============================================

/** Maximum dimension to downsample to before analysis */
const ANALYSIS_MAX_DIM = 512;

/** Grid squares smaller than this in original pixels are ignored */
const MIN_GRID_PX = 15;

/** Grid squares larger than this in original pixels are ignored */
const MAX_GRID_PX = 600;

/** Autocorrelation peak must exceed this to be reported (0–1) */
const MIN_CONFIDENCE = 0.22;

/** Need at least this many grid squares to confirm the pattern */
const MIN_GRID_COUNT = 3;

export interface GridDetectionResult {
  gridSize: number;    // px per square in the original image
  width: number;       // estimated grid columns
  height: number;      // estimated grid rows
  confidence: number;  // 0–1, higher = more certain
}

/**
 * Analyse a map image URL and return the detected grid parameters,
 * or null if no confident grid pattern is found.
 */
export async function detectMapGrid(imageUrl: string): Promise<GridDetectionResult | null> {
  const img = await loadImage(imageUrl);
  if (!img.width || !img.height) return null;

  // Downsample: keep aspect ratio, limit to ANALYSIS_MAX_DIM
  const scale = Math.min(1, ANALYSIS_MAX_DIM / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  // Draw to offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);

  const { data: pixels } = ctx.getImageData(0, 0, w, h);

  // Build grayscale column-sum and row-sum projections
  const colProj = new Float32Array(w);
  const rowProj = new Float32Array(h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // Weighted luminance (ITU-R BT.601)
      const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      colProj[x] += gray;
      rowProj[y] += gray;
    }
  }

  // Normalise to average brightness per column / row
  for (let x = 0; x < w; x++) colProj[x] /= h;
  for (let y = 0; y < h; y++) rowProj[y] /= w;

  // Period search range — converted to downsampled-pixel units
  const minP = Math.max(3, Math.round(MIN_GRID_PX * scale));
  const maxPCol = Math.min(Math.floor(w / MIN_GRID_COUNT), Math.round(MAX_GRID_PX * scale));
  const maxPRow = Math.min(Math.floor(h / MIN_GRID_COUNT), Math.round(MAX_GRID_PX * scale));

  const colResult = findPeriod(colProj, minP, maxPCol);
  const rowResult = findPeriod(rowProj, minP, maxPRow);

  // Require at least one axis to produce a confident result
  if (!colResult && !rowResult) return null;

  // Weighted average of the two axis periods (if both found)
  let periodScaled: number;
  let confidence: number;

  if (colResult && rowResult) {
    const totalConf = colResult.confidence + rowResult.confidence;
    periodScaled = (colResult.period * colResult.confidence + rowResult.period * rowResult.confidence) / totalConf;
    confidence = totalConf / 2;
  } else {
    const r = (colResult ?? rowResult)!;
    periodScaled = r.period;
    confidence = r.confidence;
  }

  if (confidence < MIN_CONFIDENCE) return null;

  // Scale the detected period back to original-image pixels
  const gridSizePx = periodScaled / scale;

  // Snap to a whole number; bias toward multiples of 5
  const gridSize = snapToNice(gridSizePx);
  if (gridSize < MIN_GRID_PX) return null;

  const width = Math.round(img.width / gridSizePx);
  const height = Math.round(img.height / gridSizePx);

  if (width < MIN_GRID_COUNT || height < MIN_GRID_COUNT) return null;

  return { gridSize, width, height, confidence: Math.min(1, confidence) };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = url;
  });
}

/**
 * Find the dominant period in a 1D signal using normalized autocorrelation.
 * Returns the lag (in samples) of the first strong peak above MIN_CONFIDENCE,
 * along with its confidence value.
 */
function findPeriod(
  signal: Float32Array,
  minLag: number,
  maxLag: number
): { period: number; confidence: number } | null {
  const n = signal.length;
  if (maxLag <= minLag || n < minLag * 2) return null;

  // Centre the signal
  const mean = signal.reduce((a, b) => a + b, 0) / n;
  const c: number[] = Array.from(signal).map(v => v - mean);

  // Zero-lag variance (normalisation factor)
  const var0 = c.reduce((a, b) => a + b * b, 0);
  if (var0 === 0) return null;

  // Compute autocorrelation for each candidate lag
  const acValues: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const count = n - lag;
    for (let i = 0; i < count; i++) {
      sum += c[i] * c[i + lag];
    }
    acValues.push(sum / var0);
  }

  // Find the first local maximum that exceeds MIN_CONFIDENCE
  // "First" matters because we want the fundamental period, not a harmonic.
  let bestLag = -1;
  let bestConf = MIN_CONFIDENCE;

  for (let i = 1; i < acValues.length - 1; i++) {
    const isLocalMax = acValues[i] > acValues[i - 1] && acValues[i] >= acValues[i + 1];
    if (isLocalMax && acValues[i] > bestConf) {
      // Accept the first qualifying peak; later peaks are likely harmonics.
      bestConf = acValues[i];
      bestLag = i + minLag;
      break;
    }
  }

  if (bestLag === -1) return null;
  return { period: bestLag, confidence: bestConf };
}

/**
 * Round a raw pixel period to the nearest integer,
 * then nudge toward the closest multiple of 5 if it's within 2px.
 * e.g. 48 → 50, 97 → 100, 53 → 53 (not close enough)
 */
function snapToNice(px: number): number {
  const rounded = Math.round(px);
  const nearestFive = Math.round(rounded / 5) * 5;
  return Math.abs(nearestFive - rounded) <= 2 ? nearestFive : rounded;
}
