// ============================================
// Drawings on the map, as the server sends them and as the draw tool sends
// them (backend/docs/WEBSOCKET_DOCUMENTATION.md, "Drawings on the map").
//
// `Drawing` has the fields of the server's DrawingSent
// (backend/src/services/mapDrawings.ts), of the same types; each event the
// page sends names the fields of the schema the server reads it with
// (backend/src/validators/drawings.ts). backend/src/__tests__/keepInStep.test.ts
// fails while either differs.
// ============================================

import type { DrawingAudience, DrawingKind } from '@/constants/drawingLimits';

/** A drawing as the server sends it. */
export interface Drawing {
  id: string;
  /** Who drew it; null once their account is deleted. */
  authorId: string | null;
  audience: 'ALL' | 'DM';
  layer: 'MARKUP' | 'GROUND';
  kind: string;
  color: string;
  fillColor: string | null;
  width: number;
  rotation: number;
  sortKey: number;
  /** [[x, y], ...] in whole map pixels from the map's top-left corner. */
  points: Array<[number, number]>;
  text: string | null;
  createdAt: string;
}

/** A drawing as the draw tool sends it: the server sets its id, its author and its time. */
export interface NewDrawing {
  kind: DrawingKind;
  /** MARKUP, the only layer drawn on so far, when left out. */
  layer?: 'MARKUP';
  /** For everyone when left out; a player's is for everyone whatever it says. */
  audience?: DrawingAudience;
  color: string;
  /** Only a rectangle, an ellipse or a polygon is filled. */
  fillColor?: string | null;
  width: number;
  rotation?: number;
  sortKey?: number;
  points: Array<[number, number]>;
  /** A text label's words; no other kind has text. */
  text?: string | null;
}

/**
 * One frame of a stroke on its way, or of the laser pointer. A pen stroke's
 * or a polygon's frame carries the points added since the last one; a line's,
 * an arrow's, a rectangle's or an ellipse's carries its two points whole.
 * `end` says the stroke is over, kept or dropped.
 */
export interface DrawingPreview {
  /** The stroke's own label, letters, digits, hyphens and underscores. */
  previewId: string;
  kind: DrawingKind;
  color: string;
  width: number;
  audience?: DrawingAudience;
  laser?: boolean;
  points: Array<[number, number]>;
  end?: boolean;
}

/** `drawing:add`: a drawing for a map, with the preview it ends. */
export interface DrawingAddEvent {
  mapId: string;
  drawing: NewDrawing;
  /** Echoed on the page's own `drawing:added`. */
  opId?: string;
  previewId?: string;
}

/** The answer to `drawing:add`: the stored drawing's id, or why it was refused. */
export type DrawingAddAck = { ok: true; id: string; opId?: string } | { ok: false; error: string };

/** `drawing:remove`: one drawing, by its id. */
export interface DrawingRemoveEvent {
  mapId: string;
  drawingId: string;
  opId?: string;
}

/** `drawing:clear_mine`: the sender's drawings on a map's markup layer. */
export interface DrawingClearMineEvent {
  mapId: string;
  opId?: string;
}

/** `drawing:clear`: every drawing on a map's markup layer, or with `authorId` one member's (the DM's). */
export interface DrawingClearEvent {
  mapId: string;
  layer?: 'MARKUP';
  /** A member's user id: only their drawings for everyone, or all of the DM's own. */
  authorId?: string;
  opId?: string;
}

/** `drawing:preview`: one frame of a stroke on its way. */
export interface DrawingPreviewEvent {
  mapId: string;
  preview: DrawingPreview;
}

/** `drawings:request`: a map's drawings, as this member may be sent them. */
export interface DrawingsRequestEvent {
  mapId: string;
}

/** `drawing:added`, to every reader the drawing may be sent to, the sender included. */
export interface DrawingAddedBroadcast {
  mapId: string;
  drawing: Drawing;
  opId?: string;
  previewId?: string;
}

/** `drawing:removed`, to the readers who had the drawing. */
export interface DrawingRemovedBroadcast {
  mapId: string;
  drawingId: string;
  opId?: string;
}

/**
 * `drawings:cleared`, to the readers who had any of them: every drawing on
 * the layer, or, with `authorId`, that member's, by their Clear mine or the
 * DM's clear naming them.
 */
export interface DrawingsClearedBroadcast {
  mapId: string;
  layer: string;
  authorId?: string;
  opId?: string;
}

/** `drawing:previewed`: someone else's frame, as the server read it, every field filled in. */
export interface DrawingPreviewedBroadcast {
  mapId: string;
  userId: string;
  preview: Required<DrawingPreview>;
}

/** `drawings:state`: a map's drawings as this member may be sent them, in drawing order; the page replaces its list. */
export interface DrawingsStateBroadcast {
  mapId: string;
  drawings: Drawing[];
}
