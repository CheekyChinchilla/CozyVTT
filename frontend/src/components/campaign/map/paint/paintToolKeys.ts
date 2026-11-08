// ============================================
// Each Mapmaker tool's key: what picks the tool while Mapmaker is on
// (usePaintSurface), what its button's title says (PaintControls) and what
// the shortcuts window lists (MAP_SHORTCUTS in keyboard.ts).
// ============================================

import type { PaintTool } from './usePaintSurface';

/** Each tool's key, as its button and the shortcuts window write it. */
export const PAINT_TOOL_KEYS: Record<PaintTool, string> = {
  select: 'S',
  brush: 'B',
  eraser: 'E',
  line: 'L',
  rect: 'R',
  ellipse: 'O',
  polygon: 'G',
  curve: 'C',
  room: 'M',
  stamp: 'P',
  fill: 'F',
  text: 'T',
  eyedropper: 'I',
};
