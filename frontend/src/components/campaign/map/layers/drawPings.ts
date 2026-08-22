// ============================================
// Ping layer — transient "look here" marks: a coloured dot with rings
// radiating out of it, plus the sender's name.
//
// Drawn on the OVERLAY canvas, above the dynamic-lighting darkness —
// deliberately the opposite choice from the initiative turn ring. A token in
// shadow should not carry a beacon, but pointing into an unlit corner is a
// normal thing to do and the ping has to survive it.
//
// Pure: no React, no component closures. Elapsed time arrives as `now`.
// ============================================

import type { Viewport } from './types';

/** Full life of a ping, in milliseconds. */
export const PING_DURATION_MS = 1600;
/** Rings per ping, and how far apart in time they start. */
const RING_COUNT = 3;
const RING_STAGGER = 0.18;
/** Ring radius sweep, in screen px. */
const RING_START_RADIUS = 6;
const RING_END_RADIUS = 56;
/** Centre dot. */
const DOT_RADIUS = 7;

const CASING = 'rgba(0, 0, 0, 0.75)';
const CASING_EXTRA_WIDTH = 3;
const RING_WIDTH = 3;

const LABEL_PILL = 'rgba(0, 0, 0, 0.72)';
const LABEL_TEXT = '#ffffff';

export interface ActivePing {
  id: string;
  /** Map-pixel coordinates — world space, so the ping stays put while panning. */
  x: number;
  y: number;
  /** Display name of the sender, resolved client-side from the roster. */
  name: string;
  /** The sender's identity colour. */
  color: string;
  startedAt: number;
}

export interface PingDrawState {
  pings: readonly ActivePing[];
  /** Timestamp for animation progress (Date.now() at frame time). */
  now: number;
  /** When true the rings hold still and only fade — no expansion. */
  reducedMotion: boolean;
}

/** Ease-out cubic: fast outward burst that settles, rather than a linear crawl. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function drawPings(
  ctx: CanvasRenderingContext2D,
  state: PingDrawState,
  viewport: Viewport
): void {
  const { zoom } = viewport;

  for (const ping of state.pings) {
    const life = (state.now - ping.startedAt) / PING_DURATION_MS;
    if (life < 0 || life >= 1) continue;

    ctx.save();

    // ── Radiating rings ──────────────────────────────────────────────────
    for (let i = 0; i < RING_COUNT; i++) {
      // Each ring starts a little later than the one before it.
      const ringLife = (life - i * RING_STAGGER) / (1 - (RING_COUNT - 1) * RING_STAGGER);
      if (ringLife <= 0 || ringLife >= 1) continue;

      const radius = state.reducedMotion
        // Held mid-sweep: the mark is still obvious, nothing moves.
        ? (RING_START_RADIUS + (RING_END_RADIUS - RING_START_RADIUS) * 0.45) / zoom
        : (RING_START_RADIUS + (RING_END_RADIUS - RING_START_RADIUS) * easeOut(ringLife)) / zoom;

      // Fade as it travels outward.
      ctx.globalAlpha = 1 - ringLife;

      // Dark casing first, coloured core over it — one half always has an
      // edge against whatever the map image is underneath.
      ctx.strokeStyle = CASING;
      ctx.lineWidth = (RING_WIDTH + CASING_EXTRA_WIDTH) / zoom;
      ctx.beginPath();
      ctx.arc(ping.x, ping.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = ping.color;
      ctx.lineWidth = RING_WIDTH / zoom;
      ctx.beginPath();
      ctx.arc(ping.x, ping.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ── Centre dot ───────────────────────────────────────────────────────
    // Holds full opacity for most of the life, then fades out at the end.
    ctx.globalAlpha = life < 0.7 ? 1 : 1 - (life - 0.7) / 0.3;

    const dotR = DOT_RADIUS / zoom;
    ctx.beginPath();
    ctx.arc(ping.x, ping.y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = ping.color;
    ctx.fill();
    ctx.strokeStyle = CASING;
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();

    // ── Name label ───────────────────────────────────────────────────────
    // On an opaque pill, so the text contrasts against its own background
    // rather than against the map. Same technique as the ruler's readout.
    if (ping.name) {
      const fontSize = Math.max(11, 12 / zoom);
      ctx.font = `bold ${fontSize}px 'Inter', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const pad = 5 / zoom;
      const textW = ctx.measureText(ping.name).width;
      const pillH = fontSize + pad * 2;
      const pillY = ping.y + dotR + 6 / zoom;

      ctx.fillStyle = LABEL_PILL;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(ping.x - textW / 2 - pad, pillY, textW + pad * 2, pillH, 4 / zoom);
      } else {
        ctx.rect(ping.x - textW / 2 - pad, pillY, textW + pad * 2, pillH);
      }
      ctx.fill();

      ctx.fillStyle = LABEL_TEXT;
      ctx.fillText(ping.name, ping.x, pillY + pillH / 2);
    }

    ctx.restore();
  }
}
