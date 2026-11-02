// ============================================
// The colours offered for a drawn map, by name: earth tones for floors,
// walls, grass and water, then the draw tool's eight. Any #rrggbb may be
// picked besides.
// ============================================

import { DRAWING_LIMITS } from '@/constants/drawingLimits';
import { COLOUR_NAMES } from '../../DrawControls';
import { DRAWN_MAP_BACKGROUND } from './drawnMapSize';

export interface PaintColour {
  name: string;
  value: string;
}

export const PAINT_COLOURS: readonly PaintColour[] = [
  { name: 'Parchment', value: DRAWN_MAP_BACKGROUND },
  { name: 'Sand', value: '#d9c08f' },
  { name: 'Stone', value: '#9b958a' },
  { name: 'Slate', value: '#55595f' },
  { name: 'Earth', value: '#8a6440' },
  { name: 'Dark wood', value: '#4a3423' },
  { name: 'Grass', value: '#79a050' },
  { name: 'Forest', value: '#355c37' },
  { name: 'Water', value: '#4f8bbd' },
  ...DRAWING_LIMITS.namedColors.map((value, i) => ({ name: COLOUR_NAMES[i], value })),
];

/** A colour as a colour input gives it, lower case, or null for anything else. */
export function pickedColour(value: string): string | null {
  const colour = value.toLowerCase();
  return /^#[0-9a-f]{6}$/.test(colour) ? colour : null;
}
