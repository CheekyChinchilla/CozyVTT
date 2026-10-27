/**
 * Drawings on a map as they are read and sent.
 *
 * One shape for every path that sends a drawing: the live table's events,
 * the REST read, and the lists sent again after a map is resized or a
 * member's role changes. Each reader is given what `drawingSentTo` allows their
 * role (utils/drawingRules.ts), so a drawing for the DM alone never leaves
 * the server for anyone else, whichever path it takes.
 */

import type { MapDrawing, Prisma } from '@prisma/client';
import { pointsCanMatter, type MarkupHeld } from '../validators/drawings';
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
 * `annotations`: the fields `drawing:add` takes, without its id, its author
 * or its time, which the importing server sets.
 */
export function drawingForArchive(row: MapDrawing) {
  return {
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

/** A map's drawings as a member of this role is sent them, in drawing order. */
export async function drawingsFor(mapId: string, role: string | undefined, db: Reader = prisma): Promise<DrawingSent[]> {
  const rows = await db.mapDrawing.findMany({
    where: { mapId, ...(role === 'DM' ? {} : { audience: 'ALL' as const }) },
    orderBy: [...DRAWING_ORDER],
  });
  return rows.map(drawingSent);
}

/**
 * What a map's markup layer holds, for an add of `adding` points: read
 * under the map's lock, so drawings sent together are counted one after
 * another. The drawings are counted first, which reads no point. Their
 * points are added up only when they could decide the add
 * (pointsCanMatter), since adding them up reads every drawing's points
 * whole while the lock is held.
 */
export async function markupHeld(tx: Prisma.TransactionClient, mapId: string, adding: number): Promise<MarkupHeld> {
  const [counted] = await tx.$queryRaw<Array<{ drawings: number }>>`
    SELECT COUNT(*)::int AS drawings FROM "MapDrawing" WHERE "mapId" = ${mapId} AND layer = 'MARKUP'`;
  const drawings = counted?.drawings ?? 0;
  if (!pointsCanMatter(drawings, adding)) return { drawings, points: null };
  const [summed] = await tx.$queryRaw<Array<{ points: number }>>`
    SELECT COALESCE(SUM(jsonb_array_length(points)), 0)::int AS points
    FROM "MapDrawing" WHERE "mapId" = ${mapId} AND layer = 'MARKUP'`;
  return { drawings, points: summed?.points ?? 0 };
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
        event: 'drawings:state', data: { mapId, drawings: all.filter((d) => drawingSentTo(role, d)) },
      }));
    });
  } catch (error) {
    logger.warn('Drawings not sent again; the change stands', { err: error, mapId });
  }
}
