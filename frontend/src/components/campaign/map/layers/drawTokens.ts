// ============================================
// Token layer — token images/placeholders, spirit + disposition rings,
// HP bars, hidden-token dots, hover outline, condition badges, and the
// drag ghost.
// Pure: no React, no component closures. Ownership checks arrive as a
// predicate; animation progress uses the caller-provided `now`.
// ============================================

import type { Token } from '@/types';
import { TokenLayer, TokenType, TokenDisposition } from '@/types';
import type { CharacterHpInfo } from '@/utils/characterHp';
import type { TokenAnimation, Viewport } from './types';

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
}

function placeholderColor(token: Token): string {
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

  for (const token of state.tokens) {
    // Non-DM clients: skip hidden tokens (server already filters, this is a safeguard)
    if (!token.visible && !isDM) continue;

    // Non-DM clients: skip tokens whose center is in a fogged (unrevealed) cell.
    // Exception: players always see their OWN tokens (you know where you are).
    // revealedCells === null means fog data hasn't been received yet — show everything.
    if (!isDM && state.revealedCells) {
      if (!state.isOwnToken(token)) {
        const fogCols = mapWidth;
        // Token grid Y is bottom-left origin; fog grid is top-left origin
        const fogRow = mapHeight - 1 - Math.floor(token.position.y + (token.size.height - 1) / 2);
        const fogCol = Math.floor(token.position.x + (token.size.width - 1) / 2);
        const fogIdx = fogRow * fogCols + fogCol;
        if (!state.revealedCells.has(fogIdx)) continue;
      }
    }

    // DM: skip spirit tokens if the DM has hidden them from view
    if (isDM && !state.dmShowSpiritTokens && token.layer === TokenLayer.SPIRIT) continue;

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
    // cell; the token extends upward in grid-Y, so its top-left pixel
    // corresponds to grid row (posY + height - 1).
    const tokenX = posX * gridSize;
    const tokenY = (mapHeight - posY - token.size.height) * gridSize;

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

    // HP bar — NPC tokens use token.hp (DM-controlled visibility);
    // player tokens always show HP sourced from the character HP cache.
    const playerHp = token.characterId ? (state.characterHpCache[token.characterId] ?? null) : null;
    const hpSource = playerHp ?? (token.hp && token.hp.max > 0 && (isDM || token.showHpBar) ? token.hp : null);
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

    // Condition indicator badges — small amber dots along the top of the token
    if (token.conditions && token.conditions.length > 0) {
      const condCount = token.conditions.length;
      const badgeR = Math.max(5, 5 / zoom);
      const gap = badgeR * 2.4;
      const totalW = condCount * gap - (gap - badgeR * 2);
      const startX = centerX - totalW / 2 + badgeR;
      const badgeY = displayMode === 'full-art'
        ? tokenY - badgeR - 2 / zoom
        : centerY - radius - badgeR - 2 / zoom;

      for (let ci = 0; ci < condCount; ci++) {
        const bx = startX + ci * gap;
        ctx.beginPath();
        ctx.arc(bx, badgeY, badgeR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 0.5 / zoom;
        ctx.stroke();

        const condLetter = token.conditions[ci].charAt(0).toUpperCase();
        const condFontSize = Math.max(7, badgeR * 1.2);
        ctx.font = `bold ${condFontSize}px 'Inter', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(condLetter, bx, badgeY + condFontSize * 0.03);
      }
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
    const ghostY = (mapHeight - ghostPosY - draggedToken.size.height) * gridSize;

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
