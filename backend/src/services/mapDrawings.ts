/**
 * Drawings on a map as they are read and sent.
 *
 * One shape for every path that sends a drawing: the live table's events
 * and the REST read. Each reader is given what `drawingSentTo` allows their
 * role (utils/drawingRules.ts), so a drawing for the DM alone never leaves
 * the server for anyone else, whichever path it takes.
 */

import type { MapDrawing, Prisma } from '@prisma/client';
import { pointsCanMatter, type MarkupHeld } from '../validators/drawings';
import { prisma } from '../config/database';

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

