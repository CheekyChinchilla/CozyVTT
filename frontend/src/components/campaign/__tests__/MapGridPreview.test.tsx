/**
 * The grid preview in Create Map and Edit Map, at the screen's pixel ratio.
 *
 * Its canvas held one pixel per CSS pixel, so on a phone or a high-density
 * screen the picture and the grid lines were drawn soft, at a third of the
 * pixels on a phone. It now holds the preview's 280 CSS pixels times the
 * ratio the map's own canvases use (`effectiveDpr`), and draws through one
 * transform, so what it draws is placed as before.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import MapGridPreview from '../MapGridPreview';
import { recordDrawing, pictures } from '@/test/recordingCanvas';
import createSource from '../CreateMapModal.tsx?raw';
import editSource from '../EditMapModal.tsx?raw';

const drawing = recordDrawing();

function atRatio(ratio: number) {
  Object.defineProperty(window, 'devicePixelRatio', { value: ratio, configurable: true });
}

afterEach(() => atRatio(1));

describe('the grid preview', () => {
  it('holds 280 CSS pixels times the screen\'s ratio and draws through that scale', () => {
    atRatio(3);
    render(<MapGridPreview imageUrl="/map.png" width={10} height={10} gridSize={100} zoom={1} />);
    const canvas = screen.getByLabelText('Grid alignment preview') as HTMLCanvasElement;
    expect(canvas.width).toBe(840);
    expect(canvas.height).toBe(840);
    pictures[0].load();
    const calls = drawing.take(canvas);
    const scaled = calls.filter((c) => c.method === 'setTransform').slice(-1)[0];
    expect(scaled?.args).toEqual([3, 0, 0, 3, 0, 0]);
    // The map fills the 280 by 280 preview, placed in CSS pixels as before.
    expect(calls.find((c) => c.method === 'drawImage')?.args.slice(1)).toEqual([0, 0, 280, 280]);
  });

  it('holds 280 pixels on a screen of ratio 1', () => {
    render(<MapGridPreview imageUrl={null} width={10} height={10} gridSize={100} zoom={1} />);
    const canvas = screen.getByLabelText('Grid alignment preview') as HTMLCanvasElement;
    expect(canvas.width).toBe(280);
    expect(drawing.take(canvas).some((c) => c.method === 'fillText' && c.args[0] === 'Select a map image')).toBe(true);
  });

  it('is one component both map dialogs draw', () => {
    for (const source of [createSource, editSource]) {
      expect(source).toContain("import MapGridPreview from './MapGridPreview';");
      expect(source).not.toMatch(/function MapPreviewCanvas|<canvas/);
    }
  });
});
