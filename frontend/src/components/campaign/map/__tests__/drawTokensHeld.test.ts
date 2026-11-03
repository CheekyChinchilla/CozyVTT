/**
 * A token held by a tap, on its own square, keeps what is drawn around it.
 *
 * A held token was drawn only as a faded picture, so while it was held it
 * lost its hit-point bar, its condition badges, the turn ring and the peek
 * ring. With a mouse that was brief; on a tablet a hold can last. While it
 * sits on its own square it is now drawn as it always is, faded, with all of
 * them; carried to another square it is the faded picture there.
 */

import { describe, it, expect } from 'vitest';
import { drawTokens, type TokenDrawState } from '../layers/drawTokens';
import type { Viewport } from '../layers/types';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

/** A canvas context that records each call, with the alpha it was made at. */
function recordingContext() {
  const calls: Array<{ name: string; alpha: number }> = [];
  const target: Record<string, unknown> = { globalAlpha: 1 };
  const stack: number[] = [];
  const ctx = new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      return () => {
        if (prop === 'save') stack.push(t.globalAlpha as number);
        if (prop === 'restore') t.globalAlpha = stack.pop() ?? 1;
        calls.push({ name: prop, alpha: t.globalAlpha as number });
        return { addColorStop: () => undefined, width: 10 };
      };
    },
    set(t, prop: string, value) { t[prop] = value; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const wolf: Token = {
  id: 't1', name: 'Wolf', characterId: null, imageUrl: '', position: { x: 2, y: 2 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: ['prone', 'poisoned'], metadata: {},
  type: TokenType.NPC, disposition: null, hp: { current: 5, max: 11 }, showHpBar: true, notes: '', initiative: null,
} as unknown as Token;

const viewport: Viewport = { zoom: 1, panOffset: { x: 0, y: 0 }, gridSize: 50, mapWidth: 10, mapHeight: 10 };

const state = (held: { x: number; y: number } | null): TokenDrawState => ({
  tokens: [wolf], tokenImages: new Map(), animatingTokens: new Map(), heldAt: {}, now: 0,
  draggedToken: held ? wolf : null, heldDrawnAt: held, hoverTokenId: null, revealedCells: null,
  isDM: true, dmShowSpiritTokens: true, dmViewBothPlanes: false, spiritAccentColor: '#000',
  characterHpCache: {}, isOwnToken: () => false, currentTurnTokenId: 't1', pulsePhase: 0.5, peekTokenId: 't1', selectedTokenId: 't1',
});

function draw(held: { x: number; y: number } | null) {
  const { ctx, calls } = recordingContext();
  drawTokens(ctx, state(held), viewport);
  return calls;
}

describe('a token held on its own square', () => {
  it('is drawn with its rings, hit-point bar and badges, as when not held', () => {
    const names = (calls: Array<{ name: string }>) => calls.map((c) => c.name);
    expect(names(draw(wolf.position))).toEqual(names(draw(null)));
  });

  it('has its picture faded, and what is around it at full strength', () => {
    const held = draw(wolf.position);
    const letter = held.find((c) => c.name === 'fillText');
    expect(letter?.alpha).toBeCloseTo(0.6);
    // The last thing drawn, a badge or the bar, is not faded.
    expect(held.filter((c) => c.name === 'fill').slice(-1)[0]?.alpha).toBe(1);
  });
});

describe('a token carried to another square', () => {
  it('is the faded picture there, drawn once', () => {
    const carried = draw({ x: 5, y: 5 });
    expect(carried.length).toBeLessThan(draw(null).length);
    expect(carried.filter((c) => c.name === 'fillText')).toHaveLength(1);
  });
});
