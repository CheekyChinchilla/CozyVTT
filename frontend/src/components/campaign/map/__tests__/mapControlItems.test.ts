import { describe, it, expect, vi } from 'vitest';
import type { MenuAction, MenuItem } from '@/components/ui/menu';
import { gridColorLabel, mapControlItems, mapControlsTitle, rulerColorLabel, type MapControlsActions, type MapControlsView } from '../mapControlItems';

const VIEW: MapControlsView = {
  isGM: false, hasMap: true, showGrid: true, gridColor: 'black', showRuler: false, rulerColor: 'amber', showAoE: false,
  spiritTokensShown: true, toolsShown: false, paint: null,
};

function actions(): MapControlsActions {
  return {
    fit: vi.fn(), toggleGrid: vi.fn(), nextGridColor: vi.fn(), toggleRuler: vi.fn(), nextRulerColor: vi.fn(),
    toggleAoE: vi.fn(), toggleSpiritTokens: vi.fn(), toggleTools: vi.fn(), togglePaint: vi.fn(),
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

  it('adds Tools and the spirit tokens for the GM', () => {
    expect(labels(mapControlItems({ ...VIEW, isGM: true }, actions())).slice(-3)).toEqual(['---', 'Show tools', 'Hide spirit tokens']);
    expect(labels(mapControlItems({ ...VIEW, isGM: true, toolsShown: true }, actions()))).toContain('Hide tools');
    expect(row(mapControlItems({ ...VIEW, isGM: true }, actions()), 'tools').title).toBe('Fog, Walls and Lights');
    expect(labels(mapControlItems({ ...VIEW, isGM: true, spiritTokensShown: false }, actions())).slice(-1)).toEqual(['Show spirit tokens']);
    expect(row(mapControlItems({ ...VIEW, isGM: true }, actions()), 'spirit-tokens').tone).toBe('spirit');
  });

  it('gives the GM Paint where it is offered, before Tools, and Put Paint away while it is on', () => {
    expect(labels(mapControlItems({ ...VIEW, isGM: true, paint: 'offered' }, actions())).slice(-4)).toEqual(['---', 'Mapmaker', 'Show tools', 'Hide spirit tokens']);
    expect(labels(mapControlItems({ ...VIEW, isGM: true, paint: 'on' }, actions()))).toContain('Put Mapmaker away');
    expect(row(mapControlItems({ ...VIEW, isGM: true, paint: 'offered' }, actions()), 'paint').title).toBe('Draw on the map\'s picture, on your screen until it is saved');
    expect(labels(mapControlItems({ ...VIEW, isGM: true }, actions()))).not.toContain('Mapmaker');
    const run = actions();
    row(mapControlItems({ ...VIEW, isGM: true, paint: 'offered' }, run), 'paint').run();
    expect(run.togglePaint).toHaveBeenCalledTimes(1);
    expect(mapControlsTitle(mapControlItems({ ...VIEW, isGM: true, paint: 'offered' }, actions())))
      .toBe('Map controls: fit, grid, ruler, AoE shape, Mapmaker, tools and spirit tokens');
  });

  it('says what each row does now', () => {
    const items = mapControlItems({ ...VIEW, showGrid: false, showRuler: true, rulerColor: 'purple', showAoE: true }, actions());
    expect(labels(items)).toEqual([
      'Fit to Screen', 'Show grid', '---', 'Put the ruler away', 'Ruler color: Purple', 'Put the AoE shape away',
    ]);
  });

  // The stack is drawn only on a map: with none, Show tools did nothing
  // but turn itself into Hide tools.
  it('leaves out Tools with no map, keeping the spirit tokens', () => {
    expect(labels(mapControlItems({ ...VIEW, isGM: true, hasMap: false }, actions())))
      .toEqual(['Fit to Screen', 'Hide grid', 'Grid Color: Black', '---', 'Hide spirit tokens']);
  });

  it('leaves out the ruler and the AoE shape with no map to measure on', () => {
    expect(labels(mapControlItems({ ...VIEW, hasMap: false }, actions()))).toEqual(['Fit to Screen', 'Hide grid', 'Grid Color: Black']);
  });

  it('keeps the sheet open for the colours only', () => {
    const items = mapControlItems({ ...VIEW, isGM: true, showRuler: true }, actions());
    const kept = items.filter((item): item is MenuAction => item.kind === 'command' && item.keepsOpen === true).map((item) => item.id);
    expect(kept).toEqual(['grid-color', 'ruler-color']);
  });

  it('runs what each row is for', () => {
    const run = actions();
    const items = mapControlItems({ ...VIEW, isGM: true, showRuler: true }, run);
    for (const [id, action] of [
      ['fit', run.fit], ['grid', run.toggleGrid], ['grid-color', run.nextGridColor], ['ruler', run.toggleRuler],
      ['ruler-color', run.nextRulerColor], ['aoe', run.toggleAoE], ['tools', run.toggleTools], ['spirit-tokens', run.toggleSpiritTokens],
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

  // Map controls' tooltip names what its rows are about, from the rows, so
  // a row added or left out changes it.
  it('gives Map controls a tooltip naming what its rows are about', () => {
    expect(mapControlsTitle(mapControlItems({ ...VIEW, isGM: true }, actions())))
      .toBe('Map controls: fit, grid, ruler, AoE shape, tools and spirit tokens');
    expect(mapControlsTitle(mapControlItems(VIEW, actions()))).toBe('Map controls: fit, grid, ruler and AoE shape');
    expect(mapControlsTitle(mapControlItems({ ...VIEW, hasMap: false }, actions()))).toBe('Map controls: fit and grid');
  });

  it('names every row but the colours in the tooltip', () => {
    const items = mapControlItems({ ...VIEW, isGM: true, showRuler: true }, actions());
    const title = mapControlsTitle(items);
    const named = items.filter((item) => item.kind === 'command' && !item.id.endsWith('-color'));
    expect(title.split(/, | and /).length).toBe(named.length);
  });
});
