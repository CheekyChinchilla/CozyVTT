import { describe, it, expect, vi } from 'vitest';
import type { MenuAction, MenuItem } from '@/components/ui/menu';
import { gridColorLabel, mapControlItems, rulerColorLabel, type MapControlsActions, type MapControlsView } from '../mapControlItems';

const VIEW: MapControlsView = {
  isDM: false, hasMap: true, showGrid: true, gridColor: 'black', showRuler: false, rulerColor: 'amber', showAoE: false,
  spiritTokensShown: true,
};

function actions(): MapControlsActions {
  return {
    fit: vi.fn(), toggleGrid: vi.fn(), nextGridColor: vi.fn(), toggleRuler: vi.fn(), nextRulerColor: vi.fn(),
    toggleAoE: vi.fn(), toggleSpiritTokens: vi.fn(),
  };
}

const labels = (items: MenuItem[]) => items.map((item) => (item.kind === 'separator' ? '---' : item.label));
const row = (items: MenuItem[], id: string) => items.find((item): item is MenuAction => item.kind === 'command' && item.id === id)!;

describe('the Map controls rows', () => {
  it('lists the grid, the ruler and the AoE shape for a player', () => {
    expect(labels(mapControlItems(VIEW, actions()))).toEqual([
      'Fit to Screen', 'Hide grid', 'Grid Color: Black', '---', 'Ruler', 'AoE Shape',
    ]);
  });

  it('adds the spirit tokens for the DM', () => {
    expect(labels(mapControlItems({ ...VIEW, isDM: true }, actions())).slice(-2)).toEqual(['---', 'Hide spirit tokens']);
    expect(labels(mapControlItems({ ...VIEW, isDM: true, spiritTokensShown: false }, actions())).slice(-1)).toEqual(['Show spirit tokens']);
    expect(row(mapControlItems({ ...VIEW, isDM: true }, actions()), 'spirit-tokens').tone).toBe('spirit');
  });

  it('says what each row does now', () => {
    const items = mapControlItems({ ...VIEW, showGrid: false, showRuler: true, rulerColor: 'purple', showAoE: true }, actions());
    expect(labels(items)).toEqual([
      'Fit to Screen', 'Show grid', '---', 'Put the ruler away', 'Ruler color: Purple', 'Put the AoE shape away',
    ]);
  });

  it('leaves out the ruler and the AoE shape with no map to measure on', () => {
    expect(labels(mapControlItems({ ...VIEW, hasMap: false }, actions()))).toEqual(['Fit to Screen', 'Hide grid', 'Grid Color: Black']);
  });

  it('keeps the sheet open for the colours only', () => {
    const items = mapControlItems({ ...VIEW, isDM: true, showRuler: true }, actions());
    const kept = items.filter((item): item is MenuAction => item.kind === 'command' && item.keepsOpen === true).map((item) => item.id);
    expect(kept).toEqual(['grid-color', 'ruler-color']);
  });

  it('runs what each row is for', () => {
    const run = actions();
    const items = mapControlItems({ ...VIEW, isDM: true, showRuler: true }, run);
    for (const [id, action] of [
      ['fit', run.fit], ['grid', run.toggleGrid], ['grid-color', run.nextGridColor], ['ruler', run.toggleRuler],
      ['ruler-color', run.nextRulerColor], ['aoe', run.toggleAoE], ['spirit-tokens', run.toggleSpiritTokens],
    ] as const) {
      row(items, id).run();
      expect(action).toHaveBeenCalledTimes(1);
    }
  });

  it('names the colours as the desktop toolbar does', () => {
    expect([gridColorLabel('black'), gridColorLabel('white')]).toEqual(['Grid Color: Black', 'Grid Color: White']);
    expect([rulerColorLabel('amber'), rulerColorLabel('purple'), rulerColorLabel('black')])
      .toEqual(['Ruler color: Amber', 'Ruler color: Purple', 'Ruler color: Black']);
  });
});
