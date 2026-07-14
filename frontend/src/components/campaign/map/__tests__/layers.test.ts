/**
 * Pure draw-layer tests.
 *
 * The layers are `(ctx, state, viewport) => void` with no React — so
 * they can be exercised with a recording mock context. These tests
 * assert call shape (what got drawn), not pixels: enough to catch a
 * broken guard (players seeing hidden tokens, fog filling revealed
 * cells) without being brittle about styling.
 */

import { describe, it, expect } from 'vitest';
import { drawGrid } from '../layers/drawGrid';
import { drawFog } from '../layers/drawFog';
import { drawTokens, type TokenDrawState } from '../layers/drawTokens';
import { drawWalls } from '../layers/drawWalls';
import { drawSpiritLayer } from '../layers/drawBackground';
import { computeVisionState } from '../vision';
import type { Viewport } from '../layers/types';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';
import type { WallSegment } from '@/types/walls';

// ── Recording mock 2D context ────────────────────────────────────────────────

interface RecordedCall {
  method: string;
  args: unknown[];
}

type MockCtx = CanvasRenderingContext2D & { calls: RecordedCall[] };

function makeMockCtx(): MockCtx {
  const calls: RecordedCall[] = [];
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
  };
  const gradient = { addColorStop: () => {} };
  return {
    calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineCap: 'butt',
    lineJoin: 'miter',
    filter: 'none',
    save: record('save'),
    restore: record('restore'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    rect: record('rect'),
    roundRect: record('roundRect'),
    stroke: record('stroke'),
    fill: record('fill'),
    clip: record('clip'),
    fillRect: record('fillRect'),
    clearRect: record('clearRect'),
    drawImage: record('drawImage'),
    fillText: record('fillText'),
    setLineDash: record('setLineDash'),
    setTransform: record('setTransform'),
    translate: record('translate'),
    scale: record('scale'),
    measureText: (text: string) => ({ width: text.length * 6 }),
    createRadialGradient: () => gradient,
  } as unknown as MockCtx;
}

function count(ctx: MockCtx, method: string): number {
  return ctx.calls.filter((c) => c.method === method).length;
}

function methods(ctx: MockCtx): string[] {
  return ctx.calls.map((c) => c.method);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const viewport3x3: Viewport = {
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  gridSize: 50,
  mapWidth: 3,
  mapHeight: 3,
};

function makeToken(id: string, overrides: Partial<Token> = {}): Token {
  return {
    id,
    characterId: null,
    name: `Token ${id}`,
    imageUrl: '',
    position: { x: 0, y: 0 },
    size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN,
    visible: true,
    controlledBy: null,
    rotation: 0,
    conditions: [],
    metadata: {},
    type: TokenType.NPC,
    disposition: null,
    hp: null,
    showHpBar: false,
    ...overrides,
  } as Token;
}

function baseTokenState(overrides: Partial<TokenDrawState> = {}): TokenDrawState {
  return {
    tokens: [],
    tokenImages: new Map(),
    animatingTokens: new Map(),
    now: Date.now(),
    draggedToken: null,
    dragOffset: null,
    hoverCoords: null,
    hoverTokenId: null,
    revealedCells: null,
    isDM: false,
    dmShowSpiritTokens: true,
    dmViewBothPlanes: true,
    spiritAccentColor: '#9370DB',
    characterHpCache: {},
    isOwnToken: () => false,
    ...overrides,
  };
}

const fakeImage = {} as HTMLImageElement;

// ── Tests ────────────────────────────────────────────────────────────────────

describe('drawGrid', () => {
  it('draws one line per grid boundary (N+1 vertical + N+1 horizontal)', () => {
    const ctx = makeMockCtx();
    drawGrid(ctx, { gridColor: 'black' }, viewport3x3);
    // 3×3 map → 4 vertical + 4 horizontal lines
    expect(count(ctx, 'moveTo')).toBe(8);
    expect(count(ctx, 'lineTo')).toBe(8);
    expect(count(ctx, 'stroke')).toBe(8);
  });
});

describe('drawFog', () => {
  it('player fog fills only unrevealed cells', () => {
    const ctx = makeMockCtx();
    drawFog(ctx, {
      isDM: false,
      fogState: null,
      revealedCells: new Set([0, 4]), // 2 of 9 cells revealed
      revealOpacity: new Map(),
    }, viewport3x3);
    expect(count(ctx, 'fillRect')).toBe(7);
  });

  it('skips player fog entirely until fog data arrives (revealedCells null)', () => {
    const ctx = makeMockCtx();
    drawFog(ctx, { isDM: false, fogState: null, revealedCells: null, revealOpacity: new Map() }, viewport3x3);
    expect(ctx.calls).toHaveLength(0);
  });

  it('DM fog uses the full fog grid, not revealedCells', () => {
    const ctx = makeMockCtx();
    drawFog(ctx, {
      isDM: true,
      fogState: { fogCols: 3, fogRows: 3, cellPx: 50, revealed: [true, false, false, false, false, false, false, false, true] },
      revealedCells: null,
      revealOpacity: new Map(),
    }, viewport3x3);
    expect(count(ctx, 'fillRect')).toBe(7);
  });
});

describe('drawTokens', () => {
  it('pog tokens clip to a circle before drawing the image', () => {
    const ctx = makeMockCtx();
    drawTokens(ctx, baseTokenState({
      tokens: [makeToken('a')],
      tokenImages: new Map([['a', fakeImage]]),
    }), viewport3x3);

    const seq = methods(ctx);
    const arcIdx = seq.indexOf('arc');
    const clipIdx = seq.indexOf('clip');
    const drawIdx = seq.indexOf('drawImage');
    expect(arcIdx).toBeGreaterThanOrEqual(0);
    expect(clipIdx).toBeGreaterThan(arcIdx);
    expect(drawIdx).toBeGreaterThan(clipIdx);
  });

  it('full-art tokens clip to a rounded rect, not a circle', () => {
    const ctx = makeMockCtx();
    drawTokens(ctx, baseTokenState({
      tokens: [makeToken('a', { displayMode: 'full-art' } as Partial<Token>)],
      tokenImages: new Map([['a', fakeImage]]),
    }), viewport3x3);

    const seq = methods(ctx);
    expect(seq.indexOf('roundRect')).toBeGreaterThanOrEqual(0);
    expect(seq.indexOf('clip')).toBeGreaterThan(seq.indexOf('roundRect'));
    expect(count(ctx, 'drawImage')).toBe(1);
  });

  it('players never see hidden tokens; the DM sees them', () => {
    const hidden = makeToken('h', { visible: false });
    const images = new Map([['h', fakeImage]]);

    const playerCtx = makeMockCtx();
    drawTokens(playerCtx, baseTokenState({ tokens: [hidden], tokenImages: images, isDM: false }), viewport3x3);
    expect(count(playerCtx, 'drawImage')).toBe(0);

    const dmCtx = makeMockCtx();
    drawTokens(dmCtx, baseTokenState({ tokens: [hidden], tokenImages: images, isDM: true }), viewport3x3);
    expect(count(dmCtx, 'drawImage')).toBe(1);
  });

  it('fog hides other tokens from players but never their own', () => {
    // Token at (0,0) on a 3×3 map → fog row 2, col 0 → index 6. Not revealed.
    const token = makeToken('a');
    const images = new Map([['a', fakeImage]]);
    const revealedCells = new Set<number>(); // nothing revealed

    const strangerCtx = makeMockCtx();
    drawTokens(strangerCtx, baseTokenState({
      tokens: [token], tokenImages: images, revealedCells, isOwnToken: () => false,
    }), viewport3x3);
    expect(count(strangerCtx, 'drawImage')).toBe(0);

    const ownerCtx = makeMockCtx();
    drawTokens(ownerCtx, baseTokenState({
      tokens: [token], tokenImages: images, revealedCells, isOwnToken: () => true,
    }), viewport3x3);
    expect(count(ownerCtx, 'drawImage')).toBe(1);
  });

  it('tokens without images get a lettered placeholder circle', () => {
    const ctx = makeMockCtx();
    drawTokens(ctx, baseTokenState({ tokens: [makeToken('a', { name: 'Goblin' })] }), viewport3x3);
    expect(count(ctx, 'fillText')).toBe(1);
    expect(ctx.calls.find((c) => c.method === 'fillText')?.args[0]).toBe('G');
  });
});

describe('drawWalls', () => {
  const wall: WallSegment = { id: 'w1', x1: 0, y1: 0, x2: 100, y2: 0, type: 'wall' };
  const door: WallSegment = { id: 'd1', x1: 100, y1: 0, x2: 150, y2: 0, type: 'door-closed' };

  function wallsState(overrides: Record<string, unknown> = {}) {
    return {
      wallSegments: [wall, door],
      isDM: false,
      wallColor: '#ff6600',
      hoveredWallId: null,
      selectedWallId: null,
      hoveredDoorId: null,
      showEndpoints: false,
      dragEndpoint: null,
      selectedEndpoint: null,
      lightingEnabled: false,
      visPolygons: [],
      ...overrides,
    };
  }

  it('players with lighting OFF see doors AND wall outlines', () => {
    const ctx = makeMockCtx();
    drawWalls(ctx, wallsState(), viewport3x3);
    // Two segments drawn: one moveTo/lineTo pair each, plus the door indicator arc
    expect(count(ctx, 'moveTo')).toBe(2);
    expect(count(ctx, 'arc')).toBe(1); // closed-door center dot
  });

  it('players with lighting ON and no vision see no doors (LOS filtered)', () => {
    const ctx = makeMockCtx();
    drawWalls(ctx, wallsState({
      lightingEnabled: true,
      visPolygons: [{ poly: { points: [] }, cx: 0, cy: 0 }],
    }), viewport3x3);
    // Door filtered by empty polygon; walls not drawn under lighting
    expect(count(ctx, 'moveTo')).toBe(0);
  });

  it('DM sees all segments and endpoint nodes while a wall tool is active', () => {
    const ctx = makeMockCtx();
    drawWalls(ctx, wallsState({ isDM: true, showEndpoints: true }), viewport3x3);
    // 2 segments + 3 unique endpoints (100,0 shared junction)
    expect(count(ctx, 'moveTo')).toBeGreaterThanOrEqual(2);
    expect(count(ctx, 'arc')).toBe(1 + 3); // door dot + 3 endpoint nodes
  });
});

describe('drawSpiritLayer', () => {
  const base = {
    spiritLayerImage: fakeImage,
    spiritLayerOpacity: 1,
    spiritActive: true,
    isInSpiritRealm: true,
    isDM: false,
    dmViewBothPlanes: true,
  };

  it('draws for a player in the spirit realm', () => {
    const ctx = makeMockCtx();
    drawSpiritLayer(ctx, base, viewport3x3);
    expect(count(ctx, 'drawImage')).toBe(1);
  });

  it('does not draw for a player outside the spirit realm', () => {
    const ctx = makeMockCtx();
    drawSpiritLayer(ctx, { ...base, spiritActive: false, isInSpiritRealm: false }, viewport3x3);
    expect(count(ctx, 'drawImage')).toBe(0);
  });

  it('DM in dual-plane mode sees a ghost hint even when spirit is inactive', () => {
    const ctx = makeMockCtx();
    drawSpiritLayer(ctx, { ...base, isDM: true, spiritActive: false, isInSpiritRealm: false }, viewport3x3);
    expect(count(ctx, 'drawImage')).toBe(1);
  });
});

describe('computeVisionState', () => {
  it('computes token centers in canvas coordinates (grid-Y flipped)', () => {
    const token = makeToken('a', { position: { x: 0, y: 0 }, sightRadius: 2 } as Partial<Token>);
    const vision = computeVisionState([token], [], [], viewport3x3);
    expect(vision.tokenVision).toHaveLength(1);
    // Token at bottom-left cell → center (25, (3 - 0 - 0.5) * 50 = 125)
    expect(vision.tokenVision[0].cx).toBe(25);
    expect(vision.tokenVision[0].cy).toBe(125);
    expect(vision.tokenVision[0].poly.points.length).toBeGreaterThan(2);
  });

  it('orders sources tokens-first (the door LOS filter relies on it)', () => {
    const token = makeToken('a', { sightRadius: 2 } as Partial<Token>);
    const light = { id: 'l1', x: 75, y: 75, brightRadius: 1, dimRadius: 2, color: '#ffaa00', enabled: true };
    const vision = computeVisionState([token], [light], [], viewport3x3);
    expect(vision.all).toHaveLength(2);
    expect(vision.all[0]).toBe(vision.tokenVision[0]);
    expect(vision.all[1]).toBe(vision.lightVision[0]);
  });
});
