/**
 * Drawings on a map as they are read and sent.
 *
 * One shape for every path that sends a drawing: the live table's events,
 * the REST read, and the lists sent again after a map is resized or a
 * member's role changes. Each reader is given what `drawingSentTo` allows their
 * role (utils/drawingRules.ts), so a drawing for the DM alone never leaves
 * the server for anyone else, whichever path it takes.
 */

import { Prisma, type MapDrawing } from '@prisma/client';
import { pointsCanMatter, drawingShare, type MarkupHeld, type MarkupShare, type DrawingPreview } from '../validators/drawings';
import { prisma } from '../config/database';
import { getSocketInstance, emitToMapReadersAs } from '../websocket/utils';
import { drawingSentTo } from '../utils/drawingRules';
import { DRAWING_LIMITS } from '../validators/drawingLimits';
import { withMapsLocked } from '../utils/mapTokens';
import logger from '../utils/logger';

/** A drawing as the server sends it. */
export interface DrawingSent {
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

// What each drawing event the server sends carries. The frontend declares
// the same fields, the same ones optional (keepInStep.test.ts), and the
// handlers hold what they send to these.

/** `drawing:added`: to each reader the drawing may be sent to, the sender included. */
export interface DrawingAddedBroadcast {
  mapId: string;
  drawing: DrawingSent;
  /** The add's own, echoed for its sender. */
  opId?: string;
  /** The preview the drawing ends. */
  previewId?: string;
}

/** `drawing:removed`: to the readers who had the drawing. */
export interface DrawingRemovedBroadcast {
  mapId: string;
  drawingId: string;
  opId?: string;
}

/**
 * `drawings:cleared`: to the readers who had any of them; `authorId` for one
 * member's, by their Clear mine or the DM's clear naming them.
 */
export interface DrawingsClearedBroadcast {
  mapId: string;
  layer: 'MARKUP' | 'GROUND';
  authorId?: string;
  opId?: string;
}

/** `drawing:previewed`: one frame of someone's stroke, as the server read it. */
export interface DrawingPreviewedBroadcast {
  mapId: string;
  userId: string | undefined;
  preview: DrawingPreview;
}

/** `drawings:state`: a map's drawings as the reader may be sent them, in drawing order. */
export interface DrawingsStateBroadcast {
  mapId: string;
  drawings: DrawingSent[];
}

/** The points a stored drawing holds, as pairs of numbers; anything else in the column is left out. */
function pointsOf(value: Prisma.JsonValue): Array<[number, number]> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (p): p is [number, number] => Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number'
  );
}

/** A stored drawing as it is sent. */
export function drawingSent(row: MapDrawing): DrawingSent {
  return {
    id: row.id,
    authorId: row.authorId,
    audience: row.audience,
    layer: row.layer,
    kind: row.kind,
    color: row.color,
    fillColor: row.fillColor,
    width: row.width,
    rotation: row.rotation,
    sortKey: row.sortKey,
    points: pointsOf(row.points),
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * A drawing as a campaign archive carries it, in its map file's
 * `drawings`: the fields `drawing:add` takes, without its id, its author or
 * its time, which the importing server sets, and the share of the map's
 * markup layer it counts to (drawingShare, by the campaign's DM, `dmId`),
 * which the import gives back to it.
 */
export function drawingForArchive(row: MapDrawing, dmId: string | null) {
  return {
    share: drawingShare(row, dmId),
    audience: row.audience,
    layer: row.layer,
    kind: row.kind,
    color: row.color,
    fillColor: row.fillColor,
    width: row.width,
    rotation: row.rotation,
    sortKey: row.sortKey,
    points: pointsOf(row.points),
    text: row.text,
  };
}

/**
 * The order a map's drawings are drawn in, and so sent in: by `sortKey`,
 * then the order they were made, then their id, so every page draws two
 * drawings made in the same millisecond the same way round.
 */
export const DRAWING_ORDER = [
  { sortKey: 'asc' }, { createdAt: 'asc' }, { id: 'asc' },
] as const satisfies Prisma.MapDrawingOrderByWithRelationInput[];

type Reader = Pick<typeof prisma, 'mapDrawing'> | Prisma.TransactionClient;

/**
 * The campaign's DM the shares of its maps' markup layers count by: the
 * one seated first, so a campaign an older version left with two DM rows
 * counts by the same one from one add to the next.
 */
export async function campaignDmId(
  db: Pick<typeof prisma, 'campaignMembership'> | Prisma.TransactionClient, campaignId: string,
): Promise<string | null> {
  const dm = await db.campaignMembership.findFirst({
    where: { campaignId, role: 'DM' },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    select: { userId: true },
  });
  return dm?.userId ?? null;
}

/** A map's drawings as a member of this role is sent them, in drawing order. */
export async function drawingsFor(mapId: string, role: string | undefined, db: Reader = prisma): Promise<DrawingSent[]> {
  const rows = await db.mapDrawing.findMany({
    where: { mapId, ...(role === 'DM' ? {} : { audience: 'ALL' as const }) },
    orderBy: [...DRAWING_ORDER],
  });
  return rows.map(drawingSent);
}

/**
 * What one share of a map's markup layer holds, for an add of `adding`
 * points (drawingShare): the DM's, every drawing for the DM alone and the
 * campaign's DM's (`dmId`) for everyone, or the players', every other
 * drawing for everyone. Read under the map's lock, so
 * drawings sent together are counted one after another. The drawings are
 * counted first, which reads no point. Their points are added up only when
 * they could decide the add (pointsCanMatter), since adding them up reads
 * every drawing's points whole while the lock is held.
 */
export async function markupHeld(
  tx: Prisma.TransactionClient, mapId: string, adding: number, share: MarkupShare, dmId: string | null,
): Promise<MarkupHeld> {
  const inShare = share === 'DM'
    ? dmId === null ? Prisma.sql`audience = 'DM'` : Prisma.sql`(audience = 'DM' OR "authorId" = ${dmId})`
    : dmId === null ? Prisma.sql`audience = 'ALL'` : Prisma.sql`(audience = 'ALL' AND ("authorId" IS NULL OR "authorId" <> ${dmId}))`;
  const [counted] = await tx.$queryRaw<Array<{ drawings: number }>>`
    SELECT COUNT(*)::int AS drawings FROM "MapDrawing" WHERE "mapId" = ${mapId} AND layer = 'MARKUP' AND ${inShare}`;
  const drawings = counted?.drawings ?? 0;
  if (!pointsCanMatter(share, drawings, adding)) return { share, drawings, points: null };
  const [summed] = await tx.$queryRaw<Array<{ points: number }>>`
    SELECT COALESCE(SUM(jsonb_array_length(points)), 0)::int AS points
    FROM "MapDrawing" WHERE "mapId" = ${mapId} AND layer = 'MARKUP' AND ${inShare}`;
  return { share, drawings, points: summed?.points ?? 0 };
}


/**
 * Scale every drawing on a map, on every layer, as Edit Map scales its walls
 * when the map's drawn size changes: each point across by `kx` and down by
 * `ky`, rounded to whole pixels as walls are (half up), and kept inside
 * `region`, the box the resized map's drawings may lie in; each width by the
 * mean of the two, kept to DRAWING_LIMITS' 1 to 64. One statement for the
 * whole map, so the most drawing a map holds is scaled in one round trip
 * inside the map's lock. Returns how many drawings it changed.
 */
export async function scaleDrawings(
  tx: Prisma.TransactionClient,
  mapId: string,
  kx: number,
  ky: number,
  region: { minX: number; minY: number; maxX: number; maxY: number }
): Promise<number> {
  const kw = (kx + ky) / 2;
  return tx.$executeRaw`
    UPDATE "MapDrawing" SET
      points = COALESCE((
        SELECT jsonb_agg(jsonb_build_array(
          LEAST(GREATEST(floor((e.p->>0)::float8 * ${kx}::float8 + 0.5), ${region.minX}::float8), ${region.maxX}::float8)::int,
          LEAST(GREATEST(floor((e.p->>1)::float8 * ${ky}::float8 + 0.5), ${region.minY}::float8), ${region.maxY}::float8)::int
        ) ORDER BY e.ord)
        FROM jsonb_array_elements(points) WITH ORDINALITY AS e(p, ord)
      ), '[]'::jsonb),
      width = LEAST(GREATEST(floor(width * ${kw}::float8 + 0.5), ${DRAWING_LIMITS.minWidth}::float8), ${DRAWING_LIMITS.maxWidth}::float8)::int
    WHERE "mapId" = ${mapId}`;
}

/**
 * Send everyone who may read a map its drawings again, as each may be sent
 * them, as `drawings:state`: after Edit Map has scaled them, and after a
 * role change that alters which of them a member may have. The list is read
 * and sent under the map's lock, so a drawing added or erased while it is
 * read is in it or is sent after it, and never undone on a page by an older
 * list; the caller must not hold the lock. Best-effort: the change is saved
 * by then, so a failure is logged and nothing else.
 */
export async function resendDrawings(campaignId: string, mapId: string): Promise<void> {
  try {
    const io = getSocketInstance();
    await withMapsLocked([mapId], async (tx) => {
      const all = await drawingsFor(mapId, 'DM', tx);
      await emitToMapReadersAs(io, campaignId, mapId, 'drawings:state', (role) => ({
        event: 'drawings:state', data: { mapId, drawings: all.filter((d) => drawingSentTo(role, d)) } satisfies DrawingsStateBroadcast,
      }));
    });
  } catch (error) {
    logger.warn('Drawings not sent again; the change stands', { err: error, mapId });
  }
}
