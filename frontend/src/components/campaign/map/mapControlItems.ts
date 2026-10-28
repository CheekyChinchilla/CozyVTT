// ============================================
// The map's controls as data, for the compact layout's Map controls sheet.
//
// On the compact layout the band across the top of the map is one row: the
// zoom buttons and their readout, Ping, Draw and Map controls. Map controls
// opens the rest of what the toolbar holds for the viewer as an action
// sheet: Fit to Screen, the grid and its colour, and on a map the ruler and
// its colour and the AoE shape; for the DM also, on a map, Tools, which shows
// and hides the DM's tool stack (Fog, Walls and Lights), and the spirit
// tokens. Each row says what pressing it does now, since a row has no
// pressed state to show. A colour's row keeps the sheet open, so presses go
// round the colours; the others close it.
//
// The colours' names are the desktop toolbar's too, written once here.
//
// Pure: no React, no DOM.
// ============================================

import { Ghost, Grid3x3, Maximize2, Palette, Ruler, Wrench, Zap } from 'lucide-react';
import type { MenuAction, MenuItem } from '@/components/ui/menu';

export type GridColor = 'black' | 'white';
export type RulerColor = 'amber' | 'purple' | 'black';

/** The grid colour button's name and tooltip: the colour it shows now. */
export const gridColorLabel = (color: GridColor) => `Grid Color: ${color === 'black' ? 'Black' : 'White'}`;

/** The ruler colour button's name and tooltip: the colour it shows now. */
export const rulerColorLabel = (color: RulerColor) =>
  `Ruler color: ${color === 'amber' ? 'Amber' : color === 'purple' ? 'Purple' : 'Black'}`;

/** What the viewer sees of the map's controls now. */
export interface MapControlsView {
  isDM: boolean;
  /** A map is open, which the ruler and the AoE shape measure on. */
  hasMap: boolean;
  showGrid: boolean;
  gridColor: GridColor;
  showRuler: boolean;
  rulerColor: RulerColor;
  showAoE: boolean;
  /** For the DM: tokens on the spirit plane are drawn. */
  spiritTokensShown: boolean;
  /** For the DM: the tool stack shows. */
  toolsShown: boolean;
}

/** What each row does. */
export interface MapControlsActions {
  fit: () => void;
  toggleGrid: () => void;
  nextGridColor: () => void;
  toggleRuler: () => void;
  nextRulerColor: () => void;
  toggleAoE: () => void;
  toggleSpiritTokens: () => void;
  toggleTools: () => void;
}

const row = (id: string, label: string, icon: MenuAction['icon'], run: () => void, extra: Partial<MenuAction> = {}): MenuAction => ({
  kind: 'command', id, label, icon, run, ...extra,
});

/** The rows of the Map controls sheet, in order, for what the viewer sees now. */
export function mapControlItems(view: MapControlsView, actions: MapControlsActions): MenuItem[] {
  const items: MenuItem[] = [
    row('fit', 'Fit to Screen', Maximize2, actions.fit),
    row('grid', view.showGrid ? 'Hide grid' : 'Show grid', Grid3x3, actions.toggleGrid),
  ];
  if (view.showGrid) items.push(row('grid-color', gridColorLabel(view.gridColor), Palette, actions.nextGridColor, { keepsOpen: true }));

  if (view.hasMap) {
    items.push({ kind: 'separator', id: 'measuring' });
    items.push(row('ruler', view.showRuler ? 'Put the ruler away' : 'Ruler', Ruler, actions.toggleRuler, { title: 'Measure distance' }));
    if (view.showRuler) items.push(row('ruler-color', rulerColorLabel(view.rulerColor), Palette, actions.nextRulerColor, { keepsOpen: true }));
    items.push(row('aoe', view.showAoE ? 'Put the AoE shape away' : 'AoE Shape', Zap, actions.toggleAoE, { title: 'Area of effect overlay' }));
  }

  if (view.isDM) {
    items.push({ kind: 'separator', id: 'dm' });
    // The stack is drawn only on a map.
    if (view.hasMap) items.push(row('tools', view.toolsShown ? 'Hide tools' : 'Show tools', Wrench, actions.toggleTools, { title: 'Fog, Walls and Lights' }));
    items.push(row('spirit-tokens', view.spiritTokensShown ? 'Hide spirit tokens' : 'Show spirit tokens', Ghost, actions.toggleSpiritTokens, { tone: 'spirit' }));
  }
  return items;
}
