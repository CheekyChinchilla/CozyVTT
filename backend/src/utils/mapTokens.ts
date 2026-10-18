/**
 * Writing a map's tokens.
 *
 * Tokens are not rows; they are one JSON list on the map. Every write reads
 * the list, changes it and writes the whole list back, and nothing used to
 * serialise those writes: two requests that read the same list wrote each
 * other's change away. Moving tokens to another map fired a create and a
 * delete per token all at once, so every request answered success while
 * some tokens ended on neither map and others on both, and a player moving a
 * token during a DM's add or delete could lose either write. Every write to
 * a map's tokens now runs under an advisory lock on that map, inside one
 * transaction, and reads the list fresh once it holds the lock.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

/**
 * The last writer in line for each map in this process. A writer waits for
 * the one before it here, holding nothing, and only then opens its
 * transaction: the advisory lock waits inside a transaction, so a queue of
 * writers behind it each held a pooled connection, and a burst of edits to
 * one map could take the whole pool from every other request.
 */
const lastInLine = new Map<string, Promise<void>>();
const waiting = new Map<string, number>();

/**
 * How many writers in this process are waiting their turn for a map, not
 * counting the one whose turn it is. A test reads it to know a write has
 * reached the lock before it goes on.
 */
export function writersWaitingFor(mapId: string): number {
  return waiting.get(mapId) ?? 0;
}

/** Wait for this map's turn; the returned function hands it to the next writer. */
async function turnFor(mapId: string): Promise<() => void> {
  const before = lastInLine.get(mapId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => { release = resolve; });
  const tail = before.then(() => mine);
  lastInLine.set(mapId, tail);
  waiting.set(mapId, (waiting.get(mapId) ?? 0) + 1);
  try {
    await before;
  } finally {
    const left = (waiting.get(mapId) ?? 1) - 1;
    if (left > 0) waiting.set(mapId, left);
    else waiting.delete(mapId);
  }
  return () => {
    release();
    if (lastInLine.get(mapId) === tail) lastInLine.delete(mapId);
  };
}

/**
 * Run `fn` inside a transaction that holds a lock on each of the given maps
 * for its duration. The locks are taken in one order whoever asks, so two
 * moves between the same pair of maps cannot wait on each other. A caller
 * reads the tokens it changes through `tx`, after the lock, never before.
 *
 * Writers in this process take their turn for each map first (turnFor), so
 * only one of them per map holds a connection; the advisory lock still
 * covers any other process writing the same database.
 */
export async function withMapsLocked<T>(
  mapIds: string[],
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const ids = [...new Set(mapIds)].sort();
  const releases: Array<() => void> = [];
  try {
    for (const mapId of ids) releases.push(await turnFor(mapId));
    return await prisma.$transaction(async (tx) => {
      for (const mapId of ids) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${mapId}))`;
      }
      return fn(tx);
    });
  } finally {
    for (const release of releases.reverse()) release();
  }
}

/**
 * A position that keeps the token's whole footprint on the map it arrives
 * on: pulled back from the far edge by its size, never below zero. A token
 * larger than the map starts at its corner. The same rule the client
 * applies when it offers a move.
 */
export function clampTokenPosition(
  position: { x: number; y: number },
  size: { width: number; height: number },
  map: { width: number; height: number }
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(position.x, map.width - size.width)),
    y: Math.max(0, Math.min(position.y, map.height - size.height)),
  };
}
