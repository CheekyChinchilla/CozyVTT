// ============================================
// Token layer — token images/placeholders, spirit + disposition rings,
// turn highlight, HP bars, hidden-token dots, hover outline, condition
// badges, and the drag ghost.
// Pure: no React, no component closures. Ownership checks arrive as a
// predicate; animation progress uses the caller-provided `now`.
// ============================================

import type { Token } from '@/types';
import { TokenLayer, TokenType, TokenDisposition } from '@/types';
import type { CharacterHpInfo } from '@/utils/characterHp';
import type { TokenAnimation, Viewport } from './types';
import { gridYToTopPx } from '../coords';
import { conditionAbbreviation, MAX_CONDITION_BADGES } from '@/utils/conditions';
import { isTokenDowned, isTokenVisibleTo, visibleTokenHp } from '../tokenHitTest';

/** How much of its opacity a token at zero hit points keeps. */
export const DOWNED_TOKEN_ALPHA = 0.45;

export interface TokenDrawState {
  tokens: readonly Token[];
  tokenImages: ReadonlyMap<string, HTMLImageElement>;
  animatingTokens: ReadonlyMap<string, TokenAnimation>;
  /** Timestamp for tween progress (Date.now() at frame time). */
  now: number;
  draggedToken: Token | null;
  dragOffset: { x: number; y: number } | null;
  hoverCoords: { x: number; y: number } | null;
  hoverTokenId: string | null;
  /** Player fog cells — tokens centered in unrevealed cells are hidden. */
  revealedCells: Set<number> | null;
  isDM: boolean;
  dmShowSpiritTokens: boolean;
  dmViewBothPlanes: boolean;
  spiritAccentColor: string;
  characterHpCache: Record<string, CharacterHpInfo>;
  /** True when the viewing user owns/controls this token (fog exemption). */
  isOwnToken: (token: Token) => boolean;
  /**
   * Token whose turn it is, from `initiative.state`. Null when combat is
   * inactive. An id matching no drawn token (map switched, token deleted,
   * token hidden from this viewer) simply draws nothing.
   */
  currentTurnTokenId: string | null;
  /** Turn-ring breath, 0 (tightest) to 1 (widest). Pass 0.5 for a static ring. */
  pulsePhase: number;
  /**
   * Token the user is pointing at from the initiative tracker. Gets a lighter,
   * static treatment than the turn ring, and can apply at the same time.
   */
  peekTokenId: string | null;
}

// ── Turn highlight ──────────────────────────────────────────────────────────
// Fixed colors, deliberately not themed. The ring's whole job is to stay
// legible over an arbitrary user-uploaded map image, and a theme with a dark
// accent would put a dark core inside a dark casing and vanish on a dark map.
// Every other draw layer hardcodes for the same reason (disposition rings, HP
// bars, grid, walls, ruler).
//
// The casing is stroked first and wider, the core second and narrower on the
// same radius, giving a dark│gold│dark band — so one half always has an edge
// against whatever is underneath. Same trick as the wall endpoint nodes in
// drawWalls.ts.
const TURN_RING_CASING = 'rgba(0, 0, 0, 0.9)';
const TURN_RING_CORE = '#ffd166';
/** Screen-px from the token edge to the ring, at the two ends of the breath. */
const TURN_RING_GAP_MIN = 8;
const TURN_RING_GAP_RANGE = 3;
const TURN_RING_CASING_WIDTH = 6;
const TURN_RING_CORE_WIDTH = 3;

// ── Tracker-hover highlight ─────────────────────────────────────────────────
// Same dark-casing trick so it survives any map, but deliberately quieter than
// the turn ring: white instead of gold, thinner, and never animated. It sits
// outside the turn ring's widest breath (which reaches +14) so a token that is
// both acting and hovered shows two distinct, non-overlapping rings.
//
// Paired with a slight wash over the token art itself: the ring says "over
// here", the brighten confirms *which* token when several are shoulder to
// shoulder and the rings start to crowd each other.
const PEEK_RING_CASING = 'rgba(0, 0, 0, 0.75)';
const PEEK_RING_CORE = 'rgba(255, 255, 255, 0.95)';
const PEEK_RING_GAP = 17;
const PEEK_RING_CASING_WIDTH = 4;
const PEEK_RING_CORE_WIDTH = 2;
const PEEK_WASH = 'rgba(255, 255, 255, 0.18)';

/**
 * Trace a token's outline, optionally inflated by `gap`: a circle for
 * pog/top-down, a rounded rect for full-art. `gap: 0` gives the token's own
 * shape, for clipping. Mirrors the hover-border branch below.
 */
function traceTokenOutline(
  ctx: CanvasRenderingContext2D,
  displayMode: string,
  gap: number,
  zoom: number,
  geom: { tokenX: number; tokenY: number; tokenWidth: number; tokenHeight: number; centerX: number; centerY: number; radius: number }
): void {
  ctx.beginPath();
  if (displayMode === 'full-art') {
    const cornerRadius = Math.max(3, 3 / zoom) + gap;
    const x = geom.tokenX - gap;
    const y = geom.tokenY - gap;
    const w = geom.tokenWidth + gap * 2;
    const h = geom.tokenHeight + gap * 2;
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, cornerRadius);
    } else {
      ctx.rect(x, y, w, h);
    }
  } else {
    ctx.arc(geom.centerX, geom.centerY, geom.radius + gap, 0, Math.PI * 2);
  }
}

/**
 * Colour of the lettered circle drawn for a token with no art.
 *
 * Exported because the hover panel shows the same placeholder, and a second
 * copy of this would drift into showing a different colour for the same token.
 */
export function placeholderColor(token: Token): string {
  const effectiveTypeForColor = token.type ?? (token.characterId ? TokenType.PLAYER : TokenType.NPC);
  return effectiveTypeForColor === TokenType.PLAYER ? '#3b82f6' :
    token.disposition === TokenDisposition.HOSTILE  ? '#ef4444' :
    token.disposition === TokenDisposition.FRIENDLY ? '#2dd4bf' :
    token.disposition === TokenDisposition.NEUTRAL  ? '#fbbf24' :
                                                      '#78716c'; // object / default stone
}

export function drawTokens(
  ctx: CanvasRenderingContext2D,
  state: TokenDrawState,
  viewport: Viewport
): void {
  const { zoom, gridSize, mapWidth, mapHeight } = viewport;
  const { isDM } = state;

  // Who can see what — shared with hit testing, so the lower-left panel can no
  // longer name a token this viewer cannot see.
  const view = {
    isDM,
    revealedCells: state.revealedCells,
    isOwnToken: state.isOwnToken,
    dmShowSpiritTokens: state.dmShowSpiritTokens,
    mapWidth,
    mapHeight,
  };

  for (const token of state.tokens) {
    if (!isTokenVisibleTo(token, view)) continue;

    const tokenImg = state.tokenImages.get(token.id);

    // Skip dragged token (drawn separately as ghost)
    if (state.draggedToken?.id === token.id) continue;

    // Check if token is animating
    const animation = state.animatingTokens.get(token.id);
    let posX = token.position.x;
    let posY = token.position.y;

    if (animation) {
      const elapsed = state.now - animation.startTime;
      const progress = Math.min(elapsed / animation.duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      posX = animation.fromX + (animation.toX - animation.fromX) * eased;
      posY = animation.fromY + (animation.toY - animation.fromY) * eased;
    }

    // Grid coordinates → world coordinates. position is the bottom-left grid
    // cell; the token extends upward in grid-Y. See map/coords.ts.
    const tokenX = posX * gridSize;
    const tokenY = gridYToTopPx(posY, token.size.height, mapHeight, gridSize);

    const tokenWidth = token.size.width * gridSize;
    const tokenHeight = token.size.height * gridSize;

    const displayMode = token.displayMode || 'pog';
    const centerX = tokenX + tokenWidth / 2;
    const centerY = tokenY + tokenHeight / 2;
    const radius = Math.min(tokenWidth, tokenHeight) / 2;

    // Hidden tokens shown to DM at 50% opacity
    const isHiddenFromPlayers = !token.visible;

    ctx.save();
    if (isHiddenFromPlayers && isDM) {
      ctx.globalAlpha = 0.5;
    }
    // Spirit tokens seen by DM get reduced alpha so they don't overwhelm material tokens
    if (isDM && token.layer === TokenLayer.SPIRIT) {
      ctx.globalAlpha = state.dmViewBothPlanes ? 0.80 : 1.0;
    }
    // A token at zero hit points is drawn faded. It still marks where the body
    // fell, but reads as scenery rather than a combatant — which matches what
    // movement allows, since a downed token no longer holds its square.
    // Multiplied in rather than assigned, so a hidden or spirit-layer token
    // keeps its own reduction as well.
    if (isTokenDowned(token, state.characterHpCache)) {
      ctx.globalAlpha *= DOWNED_TOKEN_ALPHA;
    }

    if (tokenImg) {
      // === DRAW TOKEN IMAGE ===
      if (displayMode === 'full-art') {
        // Full-art: rectangular, no clipping — full image with alpha transparency
        const cornerRadius = Math.max(3, 3 / zoom);
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(tokenX, tokenY, tokenWidth, tokenHeight, cornerRadius);
        } else {
          ctx.rect(tokenX, tokenY, tokenWidth, tokenHeight);
        }
        ctx.clip();
        ctx.drawImage(tokenImg, tokenX, tokenY, tokenWidth, tokenHeight);
      } else {
        // Pog and Top-down: circular clip
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(tokenImg, tokenX, tokenY, tokenWidth, tokenHeight);
      }
    } else {
      // === PLACEHOLDER ICON (colored-letter circle) ===
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = placeholderColor(token);
      ctx.fill();

      // Draw initial letter
      const initial = (token.name || '?').charAt(0).toUpperCase();
      const fontSize = Math.max(12, radius * 1.0);
      ctx.font = `bold ${fontSize}px 'Inter', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(initial, centerX, centerY + fontSize * 0.04);
    }
    ctx.restore();

    const geom = { tokenX, tokenY, tokenWidth, tokenHeight, centerX, centerY, radius };
    const isPeeked = state.peekTokenId === token.id;

    // Tracker-hover wash — lifts the token art itself. Filled on the token's
    // own outline, so it never bleeds onto the map or a neighbouring token.
    if (isPeeked) {
      traceTokenOutline(ctx, displayMode, 0, zoom, geom);
      ctx.fillStyle = PEEK_WASH;
      ctx.fill();
    }

    // Turn highlight — the acting combatant during initiative.
    // Drawn FIRST among the decorations so the disposition ring, HP bar and
    // condition badges all layer over it, and drawn INSIDE this loop so it
    // inherits the visibility guards above: a token hidden or fogged from
    // this viewer is skipped before reaching here, so the ring can never
    // betray the position of an NPC the players cannot see.
    if (state.currentTurnTokenId === token.id) {
      const gap = (TURN_RING_GAP_MIN + TURN_RING_GAP_RANGE * state.pulsePhase) / zoom;

      ctx.strokeStyle = TURN_RING_CASING;
      ctx.lineWidth = TURN_RING_CASING_WIDTH / zoom;
      traceTokenOutline(ctx, displayMode, gap, zoom, geom);
      ctx.stroke();

      ctx.strokeStyle = TURN_RING_CORE;
      ctx.lineWidth = TURN_RING_CORE_WIDTH / zoom;
      traceTokenOutline(ctx, displayMode, gap, zoom, geom);
      ctx.stroke();
    }

    // Tracker-hover ring — outside the turn ring, so both can coexist.
    if (isPeeked) {
      const gap = PEEK_RING_GAP / zoom;

      ctx.strokeStyle = PEEK_RING_CASING;
      ctx.lineWidth = PEEK_RING_CASING_WIDTH / zoom;
      traceTokenOutline(ctx, displayMode, gap, zoom, geom);
      ctx.stroke();

      ctx.strokeStyle = PEEK_RING_CORE;
      ctx.lineWidth = PEEK_RING_CORE_WIDTH / zoom;
      traceTokenOutline(ctx, displayMode, gap, zoom, geom);
      ctx.stroke();
    }

    // Spirit-layer ring for DM (dashed accent-colored outline)
    if (isDM && token.layer === TokenLayer.SPIRIT) {
      ctx.strokeStyle = state.spiritAccentColor;
      ctx.lineWidth = 3 / zoom;
      ctx.setLineDash([5 / zoom, 3 / zoom]);
      ctx.beginPath();
      if (displayMode === 'full-art') {
        const cornerRadius = Math.max(3, 3 / zoom);
        if (ctx.roundRect) {
          ctx.roundRect(tokenX - 3 / zoom, tokenY - 3 / zoom, tokenWidth + 6 / zoom, tokenHeight + 6 / zoom, cornerRadius);
        } else {
          ctx.rect(tokenX - 3 / zoom, tokenY - 3 / zoom, tokenWidth + 6 / zoom, tokenHeight + 6 / zoom);
        }
      } else {
        ctx.arc(centerX, centerY, radius + 3 / zoom, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Disposition ring (NPC tokens) — pog: solid ring; top-down: subtle ring;
    // full-art: bottom border stripe
    const effectiveType = token.type ?? (token.characterId ? TokenType.PLAYER : TokenType.NPC);
    if (effectiveType === TokenType.NPC && token.disposition) {
      const ringColor =
        token.disposition === TokenDisposition.HOSTILE  ? '#ef4444' :
        token.disposition === TokenDisposition.FRIENDLY ? '#2dd4bf' :
                                                          '#fbbf24'; // neutral = amber
      if (displayMode === 'full-art') {
        const stripeH = Math.max(3, 3 / zoom);
        ctx.fillStyle = ringColor;
        ctx.fillRect(tokenX, tokenY + tokenHeight - stripeH, tokenWidth, stripeH);
      } else if (displayMode === 'pog') {
        const ringWidth = Math.max(3, 3 / zoom);
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = ringWidth;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + ringWidth / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const ringWidth = Math.max(1.5, 1.5 / zoom);
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = ringWidth;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius + ringWidth / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    }

    // HP bar — NPC tokens use token.hp (DM-controlled visibility); player
    // tokens follow the character sheet. Shared with the hover panel so the
    // two cannot disagree about what a viewer may see.
    const hpSource = visibleTokenHp(token, state.characterHpCache, isDM);
    if (hpSource) {
      const pct = Math.max(0, Math.min(1, hpSource.current / hpSource.max));
      const barW = displayMode === 'full-art' ? tokenWidth : radius * 2;
      const barH = Math.max(4, Math.round(5 / zoom));
      const barX = displayMode === 'full-art' ? tokenX : centerX - radius;
      const barY = (displayMode === 'full-art' ? tokenY + tokenHeight : centerY + radius) + Math.round(3 / zoom);

      // Background track
      ctx.fillStyle = 'rgba(15, 15, 15, 0.8)';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(barX, barY, barW, barH, 2 / zoom);
      } else {
        ctx.rect(barX, barY, barW, barH);
      }
      ctx.fill();

      // HP fill
      const hpColor = pct >= 0.75 ? '#22c55e'
                    : pct >= 0.50 ? '#84cc16'
                    : pct >= 0.25 ? '#f59e0b'
                    :               '#ef4444';
      if (pct > 0) {
        ctx.fillStyle = hpColor;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(barX, barY, Math.max(2 / zoom, barW * pct), barH, 2 / zoom);
        } else {
          ctx.rect(barX, barY, Math.max(2 / zoom, barW * pct), barH);
        }
        ctx.fill();
      }

      // Temp HP overlay (light blue)
      if (hpSource.temp > 0) {
        const tempPct = Math.min(1, hpSource.temp / hpSource.max);
        ctx.fillStyle = 'rgba(147, 197, 253, 0.75)';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(barX + barW * (1 - tempPct), barY, barW * tempPct, barH, 2 / zoom);
        } else {
          ctx.rect(barX + barW * (1 - tempPct), barY, barW * tempPct, barH);
        }
        ctx.fill();
      }
    }

    // Hidden token indicator (DM-only small red dot)
    if (isHiddenFromPlayers && isDM) {
      const dotRadius = Math.max(4, 4 / zoom);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.beginPath();
      if (displayMode === 'full-art') {
        ctx.arc(tokenX + tokenWidth - dotRadius * 2, tokenY + dotRadius * 2, dotRadius, 0, Math.PI * 2);
      } else {
        ctx.arc(centerX + radius * 0.6, centerY - radius * 0.6, dotRadius, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Hover border
    if (state.hoverTokenId === token.id) {
      ctx.strokeStyle = '#4a90e2';
      ctx.lineWidth = 3 / zoom;
      ctx.beginPath();
      if (displayMode === 'full-art') {
        const cornerRadius = Math.max(3, 3 / zoom);
        if (ctx.roundRect) {
          ctx.roundRect(tokenX - 2 / zoom, tokenY - 2 / zoom, tokenWidth + 4 / zoom, tokenHeight + 4 / zoom, cornerRadius);
        } else {
          ctx.rect(tokenX - 2 / zoom, tokenY - 2 / zoom, tokenWidth + 4 / zoom, tokenHeight + 4 / zoom);
        }
      } else {
        ctx.arc(centerX, centerY, radius + 2 / zoom, 0, Math.PI * 2);
      }
      ctx.stroke();
    }

    // Condition badges — amber pills along the top of the token.
    //
    // Two letters rather than one: a single initial cannot tell Paralyzed from
    // Poisoned, Petrified or Prone, nor Incapacitated from Invisible, which is
    // most of what a player needs to read off an enemy at a glance. Beyond four
    // the rest collapse into a "+N" pill, because a longer row grows wider than
    // the token and starts covering its neighbours. Hovering the token names
    // them all in full.
    if (token.conditions && token.conditions.length > 0) {
      const shown = token.conditions.slice(0, MAX_CONDITION_BADGES);
      const overflow = token.conditions.length - shown.length;
      const labels: string[] = shown.map((c) => conditionAbbreviation(String(c)));
      if (overflow > 0) labels.push(`+${overflow}`);

      // Sized in screen pixels above 1x zoom and held constant below it, the
      // same idiom the rings and HP bar above use — a badge is UI furniture, so
      // it should stay readable rather than shrink away with the map.
      const badgeH = Math.max(13, 13 / zoom);
      const badgeW = Math.max(19, 19 / zoom);
      const gap = Math.max(2.5, 2.5 / zoom);
      const fontSize = badgeH * 0.62;
      const radiusPx = badgeH / 2;

      const totalW = labels.length * badgeW + (labels.length - 1) * gap;
      const startX = centerX - totalW / 2;
      const badgeY = (displayMode === 'full-art'
        ? tokenY
        : centerY - radius) - badgeH - Math.max(3, 3 / zoom);

      ctx.font = `bold ${fontSize}px 'Inter', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      labels.forEach((label, ci) => {
        const bx = startX + ci * (badgeW + gap);

        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(bx, badgeY, badgeW, badgeH, radiusPx);
        } else {
          ctx.rect(bx, badgeY, badgeW, badgeH);
        }
        // The overflow marker is deliberately quieter than a real condition —
        // it is a count, not something happening to the creature.
        ctx.fillStyle = label.startsWith('+')
          ? 'rgba(120, 113, 108, 0.95)'
          : 'rgba(245, 158, 11, 0.96)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(41, 33, 20, 0.55)';
        ctx.lineWidth = Math.max(1, 1 / zoom);
        ctx.stroke();

        // Dark ink on amber rather than white: at this size white on amber is
        // the low-contrast pairing that made the old badges hard to read.
        ctx.fillStyle = label.startsWith('+') ? '#f5f5f4' : '#2b2115';
        ctx.fillText(label, bx + badgeW / 2, badgeY + badgeH / 2 + fontSize * 0.04);
      });
    }
  }

  // Dragged token as ghost — ghost position = cursor cell minus the pickup
  // offset, so whichever cell of the token was clicked stays anchored under
  // the cursor during drag.
  if (state.draggedToken && state.dragOffset && state.hoverCoords) {
    const draggedToken = state.draggedToken;
    const tokenImg = state.tokenImages.get(draggedToken.id);
    const maxPosX = mapWidth - draggedToken.size.width;
    const maxPosY = mapHeight - draggedToken.size.height;
    const ghostPosX = Math.max(0, Math.min(maxPosX, state.hoverCoords.x - state.dragOffset.x));
    const ghostPosY = Math.max(0, Math.min(maxPosY, state.hoverCoords.y - state.dragOffset.y));
    const ghostX = ghostPosX * gridSize;
    const ghostY = gridYToTopPx(ghostPosY, draggedToken.size.height, mapHeight, gridSize);

    const ghostW = draggedToken.size.width * gridSize;
    const ghostH = draggedToken.size.height * gridSize;
    const ghostCX = ghostX + ghostW / 2;
    const ghostCY = ghostY + ghostH / 2;
    const ghostR = Math.min(ghostW, ghostH) / 2;
    const ghostDisplayMode = draggedToken.displayMode || 'pog';

    ctx.save();
    ctx.globalAlpha = 0.6;

    if (tokenImg) {
      if (ghostDisplayMode === 'full-art') {
        const cr = Math.max(3, 3 / zoom);
        ctx.beginPath();
        if (ctx.roundRect) { ctx.roundRect(ghostX, ghostY, ghostW, ghostH, cr); } else { ctx.rect(ghostX, ghostY, ghostW, ghostH); }
        ctx.clip();
        ctx.drawImage(tokenImg, ghostX, ghostY, ghostW, ghostH);
      } else {
        ctx.beginPath();
        ctx.arc(ghostCX, ghostCY, ghostR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(tokenImg, ghostX, ghostY, ghostW, ghostH);
      }
    } else {
      // Ghost placeholder
      ctx.beginPath();
      ctx.arc(ghostCX, ghostCY, ghostR, 0, Math.PI * 2);
      ctx.fillStyle = placeholderColor(draggedToken);
      ctx.fill();
      const initial = (draggedToken.name || '?').charAt(0).toUpperCase();
      const fontSize = Math.max(12, ghostR * 1.0);
      ctx.font = `bold ${fontSize}px 'Inter', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(initial, ghostCX, ghostCY + fontSize * 0.04);
    }

    ctx.restore();
  }
}
