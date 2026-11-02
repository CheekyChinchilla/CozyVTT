// ============================================
// The blank picture a drawn map starts from, and the PNG made of a picture.
//
// A canvas of 16 million pixels holds 64 MiB, so every canvas made here is
// let go of as soon as it is done with: Safari keeps a canvas's pixels until
// the canvas is collected, unless its size is set to nothing.
// ============================================

/** A new canvas; the tests pass one of their own. */
export type MakeCanvas = () => HTMLCanvasElement;

const newCanvas: MakeCanvas = () => document.createElement('canvas');

/** Let go of a canvas's pixels now. */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * A canvas `width` by `height` filled with `colour`, or null where the
 * browser gives no context for a canvas that large.
 */
export function blankPicture(width: number, height: number, colour: string, make: MakeCanvas = newCanvas): HTMLCanvasElement | null {
  const canvas = make();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    releaseCanvas(canvas);
    return null;
  }
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

/**
 * The canvas as a PNG, every browser's lossless format. Null when the
 * browser makes none, as one may for a canvas too large for the device.
 */
export function pictureToPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}
