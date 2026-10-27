/**
 * What a drawing on a map may be, checked the same way on every path that
 * stores one: the live table's `drawing:add` and a campaign archive's import.
 *
 * A drawing is one of the kinds in ./drawingLimits.ts, on the markup layer,
 * for everyone or for the DM alone, with whole-pixel points in the map's
 * coordinates (from its top-left corner, as walls and lights are). Each kind
 * has its own number of points. A text label's control characters are
 * removed before its length is counted: the canvas draws them as boxes, and
 * the direction marks among them can reorder the line around them.
 *
 * Where on the map the points lie is checked against the map itself, under
 * its lock (drawingOutsideMap below), since the schema does not know the map.
 */

import { z } from 'zod';
import { geometryRegion, GEOMETRY_MARGIN_SQUARES, MAX_COORDINATE, type MapExtent } from './maps';
import { DRAWING_AUDIENCES, DRAWING_KINDS, DRAWING_LIMITS, type DrawingKind } from './drawingLimits';

export { DRAWING_AUDIENCES, DRAWING_KINDS, DRAWING_LAYERS, DRAWING_LIMITS } from './drawingLimits';
export type { DrawingAudience, DrawingKind, DrawingLayer } from './drawingLimits';

const KIND_NAMES: Record<DrawingKind, string> = {
  pen: 'pen stroke', line: 'line', arrow: 'arrow', rect: 'rectangle', ellipse: 'ellipse', polygon: 'polygon', text: 'text label',
};

export const DRAWING_KIND_REFUSAL = `A drawing must be one of: ${DRAWING_KINDS.join(', ')}`;
export const DRAWING_LAYER_REFUSAL = 'Drawings can only be made on the MARKUP layer';
export const DRAWING_AUDIENCE_REFUSAL = 'A drawing is for ALL or for the DM alone';
export const DRAWING_COLOR_REFUSAL = 'A drawing colour must be written #rrggbb';
export const DRAWING_WIDTH_REFUSAL =
  `A drawing's width must be a whole number of map pixels from ${DRAWING_LIMITS.minWidth} to ${DRAWING_LIMITS.maxWidth}`;
export const DRAWING_ROTATION_REFUSAL = 'A drawing\'s rotation must be a whole number of degrees from 0 to 359';
export const DRAWING_SORT_KEY_REFUSAL =
  `A drawing's sortKey must be a whole number from -${DRAWING_LIMITS.maxSortKey.toLocaleString('en-US')} to ${DRAWING_LIMITS.maxSortKey.toLocaleString('en-US')}`;
export const DRAWING_POINT_REFUSAL =
  `A drawing's points must be whole numbers of map pixels within ${MAX_COORDINATE.toLocaleString('en-US')} of the map's corner`;
export const DRAWING_POINT_COUNT_REFUSAL = `A drawing has 1 to ${DRAWING_LIMITS.maxPoints.toLocaleString('en-US')} points`;
export const DRAWING_TEXT_REFUSAL = `A text label needs some text, at most ${DRAWING_LIMITS.maxTextLength} characters`;
export const DRAWING_TEXT_ON_SHAPE_REFUSAL = 'Only a text label has text';
export const DRAWING_FILL_REFUSAL = 'Only a rectangle, an ellipse or a polygon can be filled';
export const DRAWING_TOO_LARGE_REFUSAL = 'This drawing is too large to store';
export const DRAWING_OUTSIDE_MAP_MESSAGE =
  `A drawing reaches too far outside the map. Drawings can extend up to ${GEOMETRY_MARGIN_SQUARES} squares past its edges.`;
export const DRAWING_PREVIEW_ID_REFUSAL = 'previewId must be 1 to 64 letters, digits, hyphens or underscores';
export const DRAWING_PREVIEW_POINTS_REFUSAL =
  `A preview frame carries at most ${DRAWING_LIMITS.maxPreviewPoints} new points`;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
/** A short id a client makes: letters, digits, hyphens and underscores, as a random UUID is. */
export const CLIENT_LABEL = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Control characters, and the marks that set the direction of the text
 * around them. Zero-width joiners stay: emoji are built with them.
 */
const UNPRINTED = /[\p{Cc}؜‎‏‪-‮⁦-⁩]/gu;

/** A text label as it is stored: without control or direction characters, trimmed. */
export function cleanLabel(text: string): string {
  return text.replace(UNPRINTED, '').trim();
}

/** The kinds that enclose an area, and so may be filled. */
const FILLED_KINDS: readonly DrawingKind[] = ['rect', 'ellipse', 'polygon'];

/** An x or a y: a whole number of map pixels within MAX_COORDINATE of the corner, as walls and lights are. */
const wholeCoordinate = z
  .number({ error: DRAWING_POINT_REFUSAL })
  .int({ error: DRAWING_POINT_REFUSAL })
  .min(-MAX_COORDINATE, { error: DRAWING_POINT_REFUSAL })
  .max(MAX_COORDINATE, { error: DRAWING_POINT_REFUSAL });

/** One point, `[x, y]`, in whole map pixels. */
export const DrawingPointSchema = z.tuple([wholeCoordinate, wholeCoordinate], { error: DRAWING_POINT_REFUSAL });

const ColorSchema = z.string({ error: DRAWING_COLOR_REFUSAL }).regex(HEX_COLOR, { error: DRAWING_COLOR_REFUSAL });

/** How many points each kind takes: at least `min`, and at most `max`. */
const POINTS_FOR: Record<DrawingKind, { min: number; max: number }> = {
  pen: { min: 2, max: DRAWING_LIMITS.maxPoints },
  polygon: { min: 3, max: DRAWING_LIMITS.maxPoints },
  line: { min: 2, max: 2 },
  arrow: { min: 2, max: 2 },
  rect: { min: 2, max: 2 },
  ellipse: { min: 2, max: 2 },
  text: { min: 1, max: 1 },
};

function pointCountRefusal(kind: DrawingKind): string {
  const { min, max } = POINTS_FOR[kind];
  const name = KIND_NAMES[kind];
  if (kind === 'polygon') return `A polygon needs at least ${min} corners`;
  const article = /^[aeiou]/.test(name) ? 'An' : 'A';
  if (min === max) return `${article} ${name} has exactly ${min} point${min === 1 ? '' : 's'}`;
  return `${article} ${name} needs at least ${min} points`;
}

/**
 * A new drawing, as a client sends it and an archive carries it. Its id,
 * author and time are the server's to set; anything else is dropped.
 */
export const NewDrawingSchema = z
  .object(
    {
      kind: z.enum(DRAWING_KINDS, { error: DRAWING_KIND_REFUSAL }),
      layer: z.enum(['MARKUP'], { error: DRAWING_LAYER_REFUSAL }).default('MARKUP'),
      audience: z.enum(DRAWING_AUDIENCES, { error: DRAWING_AUDIENCE_REFUSAL }).default('ALL'),
      color: ColorSchema,
      fillColor: ColorSchema.nullish().transform((fill) => fill ?? null),
      width: z
        .number({ error: DRAWING_WIDTH_REFUSAL })
        .int({ error: DRAWING_WIDTH_REFUSAL })
        .min(DRAWING_LIMITS.minWidth, { error: DRAWING_WIDTH_REFUSAL })
        .max(DRAWING_LIMITS.maxWidth, { error: DRAWING_WIDTH_REFUSAL }),
      rotation: z
        .number({ error: DRAWING_ROTATION_REFUSAL })
        .int({ error: DRAWING_ROTATION_REFUSAL })
        .min(0, { error: DRAWING_ROTATION_REFUSAL })
        .max(359, { error: DRAWING_ROTATION_REFUSAL })
        .default(0),
      sortKey: z
        .number({ error: DRAWING_SORT_KEY_REFUSAL })
        .int({ error: DRAWING_SORT_KEY_REFUSAL })
        .min(-DRAWING_LIMITS.maxSortKey, { error: DRAWING_SORT_KEY_REFUSAL })
        .max(DRAWING_LIMITS.maxSortKey, { error: DRAWING_SORT_KEY_REFUSAL })
        .default(0),
      points: z
        .array(DrawingPointSchema, { error: DRAWING_POINT_COUNT_REFUSAL })
        .min(1, { error: DRAWING_POINT_COUNT_REFUSAL })
        .max(DRAWING_LIMITS.maxPoints, { error: DRAWING_POINT_COUNT_REFUSAL }),
      text: z
        .string({ error: DRAWING_TEXT_REFUSAL })
        .transform(cleanLabel)
        .nullish()
        .transform((text) => text ?? null),
    },
    { error: 'A drawing must be an object' }
  )
  .superRefine((drawing, ctx) => {
    const { min, max } = POINTS_FOR[drawing.kind];
    if (drawing.points.length < min || drawing.points.length > max) {
      ctx.addIssue({ code: 'custom', message: pointCountRefusal(drawing.kind), path: ['points'] });
      return;
    }
    if (drawing.kind === 'text') {
      if (drawing.text === null || drawing.text.length === 0 || drawing.text.length > DRAWING_LIMITS.maxTextLength) {
        ctx.addIssue({ code: 'custom', message: DRAWING_TEXT_REFUSAL, path: ['text'] });
        return;
      }
    } else if (drawing.text !== null) {
      ctx.addIssue({ code: 'custom', message: DRAWING_TEXT_ON_SHAPE_REFUSAL, path: ['text'] });
      return;
    }
    if (drawing.fillColor !== null && !FILLED_KINDS.includes(drawing.kind)) {
      ctx.addIssue({ code: 'custom', message: DRAWING_FILL_REFUSAL, path: ['fillColor'] });
      return;
    }
    if (Buffer.byteLength(JSON.stringify(drawing)) > DRAWING_LIMITS.maxBytes) {
      ctx.addIssue({ code: 'custom', message: DRAWING_TOO_LARGE_REFUSAL });
    }
  });

export type NewDrawing = z.infer<typeof NewDrawingSchema>;

/**
 * Whether any of a drawing's points lies outside the region its map's walls
 * and lights may reach (validators/maps.ts): within the map, or no more than
 * GEOMETRY_MARGIN_SQUARES past its edges.
 */
export function drawingOutsideMap(points: ReadonlyArray<readonly [number, number]>, map: MapExtent): boolean {
  const r = geometryRegion(map);
  return points.some(([x, y]) => x < r.minX || x > r.maxX || y < r.minY || y > r.maxY);
}

/**
 * One frame of a drawing on its way, or of the laser pointer: what the other
 * screens draw until the stroke is stored or fades. A frame carries only the
 * points added since the one before, and `end` says the stroke is over, kept
 * or cancelled, so the other screens drop it at once. Nothing is stored.
 */
export const DrawingPreviewSchema = z.object(
  {
    previewId: z.string({ error: DRAWING_PREVIEW_ID_REFUSAL }).regex(CLIENT_LABEL, { error: DRAWING_PREVIEW_ID_REFUSAL }),
    kind: z.enum(DRAWING_KINDS, { error: DRAWING_KIND_REFUSAL }),
    color: ColorSchema,
    width: z
      .number({ error: DRAWING_WIDTH_REFUSAL })
      .int({ error: DRAWING_WIDTH_REFUSAL })
      .min(DRAWING_LIMITS.minWidth, { error: DRAWING_WIDTH_REFUSAL })
      .max(DRAWING_LIMITS.maxWidth, { error: DRAWING_WIDTH_REFUSAL }),
    audience: z.enum(DRAWING_AUDIENCES, { error: DRAWING_AUDIENCE_REFUSAL }).default('ALL'),
    laser: z.boolean({ error: 'laser must be true or false' }).default(false),
    points: z
      .array(DrawingPointSchema, { error: DRAWING_PREVIEW_POINTS_REFUSAL })
      .max(DRAWING_LIMITS.maxPreviewPoints, { error: DRAWING_PREVIEW_POINTS_REFUSAL })
      .default([]),
    end: z.boolean({ error: 'end must be true or false' }).default(false),
  },
  { error: 'A preview must be an object' }
);

export type DrawingPreview = z.infer<typeof DrawingPreviewSchema>;

// ── What a map's markup layer holds ─────────────────────────────────────────

/**
 * What an add answers when the map's markup layer holds as many drawings, or
 * as many points, as it may (DRAWING_LIMITS). Neither says how many: the
 * count takes in drawings a player is not sent.
 */
export const MARKUP_FULL_MESSAGE = 'This map holds as many drawings as it can. Erase some first.';
export const MARKUP_POINTS_FULL_MESSAGE = 'This map holds as much drawing as it can. Erase some first.';

/**
 * What a map's markup layer holds: its drawings, and the points they have
 * between them, or null where they were not counted because they cannot
 * matter (pointsCanMatter).
 */
export interface MarkupHeld {
  drawings: number;
  points: number | null;
}

/**
 * Which of the markup layer's limits one more drawing of `adding` points
 * would pass, or null when it fits. The one place the limits are applied,
 * by an add and by an import alike: a share of them by member, if it
 * comes, is a change here and in the counts handed to it.
 */
export function markupLimitReached(held: MarkupHeld, adding: number): 'drawings' | 'points' | null {
  if (held.drawings >= DRAWING_LIMITS.maxMarkupPerMap) return 'drawings';
  if (held.points !== null && held.points + adding > DRAWING_LIMITS.maxMarkupPointsPerMap) return 'points';
  return null;
}

/**
 * Whether the points on a layer holding `drawings` drawings could decide an
 * add of `adding` more: not when the layer holds as many drawings as it
 * may, which refuses the add whatever the points, and not while every
 * drawing holding the most points one may still leaves room. Counting
 * them reads every drawing's points whole.
 */
export function pointsCanMatter(drawings: number, adding: number): boolean {
  if (drawings >= DRAWING_LIMITS.maxMarkupPerMap) return false;
  return drawings * DRAWING_LIMITS.maxPoints + adding > DRAWING_LIMITS.maxMarkupPointsPerMap;
}

// ── The live table's drawing events ─────────────────────────────────────────

/** A map id: one that is not an id is answered as a map that is not there. */
const MapIdSchema = z.uuid({ error: 'Map not found' });
/** A short label a client gives its own stroke; anything else is left off. */
const LabelSchema = z.string().regex(CLIENT_LABEL).optional().catch(undefined);

/** `drawing:add`: a drawing for a map, with the preview it ends, if any. */
export const DrawingAddEventSchema = z.object(
  { mapId: MapIdSchema, drawing: NewDrawingSchema, previewId: LabelSchema },
  { error: 'Map not found' }
);

/** `drawing:remove`: one drawing, by its id. */
export const DrawingRemoveEventSchema = z.object(
  { mapId: MapIdSchema, drawingId: z.uuid({ error: 'Drawing not found' }) },
  { error: 'Map not found' }
);

/** `drawing:clear_mine`: the sender's drawings on a map's markup layer. */
export const DrawingClearMineEventSchema = z.object({ mapId: MapIdSchema }, { error: 'Map not found' });

/** `drawing:clear`: every drawing on one layer of a map, MARKUP so far. */
export const DrawingClearEventSchema = z.object(
  { mapId: MapIdSchema, layer: z.enum(['MARKUP'], { error: DRAWING_LAYER_REFUSAL }).default('MARKUP') },
  { error: 'Map not found' }
);

/** `drawing:preview`: one frame of a stroke on its way, for a map. */
export const DrawingPreviewEventSchema = z.object({ mapId: MapIdSchema, preview: DrawingPreviewSchema });

/** `drawings:request`: a map's drawings, as the sender may be sent them. */
export const DrawingsRequestEventSchema = z.object({ mapId: MapIdSchema });
