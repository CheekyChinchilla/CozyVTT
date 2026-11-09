/**
 * A token's picture, or its letter, is drawn turned to face its rotation. The
 * rings, the hit point bar and the badges around it stay upright.
 */

import { describe, it, expect } from 'vitest';
import { drawTokens, type TokenDrawState } from '../layers/drawTokens';
import type { Viewport } from '../layers/types';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

/** A canvas context that records each call and accepts every property. */
function recordingContext() {
  const calls: Array<[string, unknown[]]> = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => { calls.push([prop, args]); };
    },
    set(target, prop: string, value) { target[prop] = value; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const token = (rotation: number): Token => ({
  id: 't1', name: 'Wolf', characterId: null, imageUrl: '', position: { x: 2, y: 2 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null,
} as Token);

const viewport: Viewport = { zoom: 1, panOffset: { x: 0, y: 0 }, gridSize: 50, mapWidth: 10, mapHeight: 10 };

const state = (t: Token): TokenDrawState => ({
  tokens: [t], tokenImages: new Map(), animatingTokens: new Map(), heldAt: {}, now: 0,
  draggedToken: null, heldDrawnAt: null, hoverTokenId: null, revealedCells: null,
  isDM: true, dmShowSpiritTokens: true, dmViewBothPlanes: false, spiritAccentColor: '#000',
  characterHpCache: {}, isOwnToken: () => false, currentTurnTokenId: null, pulsePhase: 0.5, peekTokenId: null, selectedTokenId: null,
});

describe('a turned token', () => {
  it('is drawn turned about its centre', () => {
    const { ctx, calls } = recordingContext();
    drawTokens(ctx, state(token(90)), viewport);

    const rotate = calls.filter(([name]) => name === 'rotate');
    expect(rotate).toHaveLength(1);
    expect(rotate[0][1][0]).toBeCloseTo(Math.PI / 2);
    // The token's square: x 2, and grid y 2 from the bottom of a 10-square map.
    const centre = calls.find(([name]) => name === 'translate');
    expect(centre?.[1]).toEqual([125, 375]);
  });

  it('turns only its own picture: the turn is undone before anything around it', () => {
    const { ctx, calls } = recordingContext();
    drawTokens(ctx, state(token(90)), viewport);

    const names = calls.map(([name]) => name);
    const turnAt = names.indexOf('rotate');
    const letterAt = names.indexOf('fillText');
    const undoneAt = names.indexOf('restore', turnAt);
    expect(turnAt).toBeGreaterThan(-1);
    expect(turnAt).toBeLessThan(letterAt);
    expect(letterAt).toBeLessThan(undoneAt);
  });

  it('is not turned when it faces up', () => {
    const { ctx, calls } = recordingContext();
    drawTokens(ctx, state(token(0)), viewport);

    expect(calls.some(([name]) => name === 'rotate')).toBe(false);
  });
});
