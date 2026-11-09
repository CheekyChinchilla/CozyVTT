/**
 * What can be drawn on a map, and the limits on it.
 *
 * The server enforces them and the draw tool keeps to them. This file exists
 * twice, as backend/src/validators/drawingLimits.ts and
 * frontend/src/constants/drawingLimits.ts, and a test keeps the two copies
 * identical, so the tool never draws what the server refuses. The audiences
 * and layers are the database's own lists (prisma/schema.prisma), held to
 * them by a test too.
 */

/**
 * The kinds of drawing: a freehand stroke, a straight line, an arrow, a
 * rectangle, an ellipse, a closed polygon and a text label.
 */
export const DRAWING_KINDS = ['pen', 'line', 'arrow', 'rect', 'ellipse', 'polygon', 'text'] as const;
export type DrawingKind = (typeof DRAWING_KINDS)[number];

/** Who a drawing is sent to: everyone who may read the map, or the DM alone. */
export const DRAWING_AUDIENCES = ['ALL', 'DM'] as const;
export type DrawingAudience = (typeof DRAWING_AUDIENCES)[number];

/**
 * Where a drawing sits: MARKUP over the grid, GROUND under it. Only MARKUP
 * is drawn on so far; the limits below are the markup layer's.
 */
export const DRAWING_LAYERS = ['MARKUP', 'GROUND'] as const;
export type DrawingLayer = (typeof DRAWING_LAYERS)[number];

/**
 * The shares of one map's markup layer, each with room of its own: the
 * DM's, every drawing for the DM alone, whoever wrote it, and those for
 * everyone whose author is the campaign's DM as an add is counted, and the
 * players', every other drawing for everyone (a player's, a former DM's, a
 * removed member's, one whose author's account is gone). One player can
 * fill the players' share, and never the DM's, and it holds only drawings
 * a player is sent.
 */
export const MARKUP_SHARES = ['DM', 'PLAYERS'] as const;
export type MarkupShare = (typeof MARKUP_SHARES)[number];

export const DRAWING_LIMITS = {
  /**
   * What each share of one map's markup layer holds: drawings, and points
   * in all of them together. Both shares full, a full fog and 5,000 walls
   * fit in one file of a campaign archive, with room for tokens beside them.
   */
  markupShares: {
    DM: { drawings: 1000, points: 100000 },
    PLAYERS: { drawings: 1000, points: 100000 },
  },
  /** Points in one drawing, after the draw tool simplifies a stroke. */
  maxPoints: 2000,
  /** Points one preview frame adds to the stroke it shows. */
  maxPreviewPoints: 64,
  /** Characters in a text label. */
  maxTextLength: 200,
  /** A stroke's width, in map pixels. */
  minWidth: 1,
  maxWidth: 64,
  /** The most one drawing's JSON may take; 2,000 points far off the map are about 36 KB. */
  maxBytes: 65536,
  /** How far a drawing's place in its layer's order may be from 0, either way. */
  maxSortKey: 1000000,
  /** How long a preview or laser pointer stroke lasts after its last frame, in milliseconds. */
  previewTtlMs: 3000,
  /** How many preview frames a second the draw tool sends at most. */
  previewFramesPerSecond: 20,
  /** The colours the draw tool offers by name; any #rrggbb may be drawn. */
  namedColors: ['#d94f3d', '#e8a33c', '#e5d94a', '#4caf6e', '#3d8bd9', '#8e5bd9', '#f0f0f0', '#1a1a1a'],
} as const;
