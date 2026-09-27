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
 * Run `fn` inside a transaction that holds a lock on each of the given maps
 * for its duration. The locks are taken in one order whoever asks, so two
 * moves between the same pair of maps cannot wait on each other. A caller
 * reads the tokens it changes through `tx`, after the lock, never before.
 */
export async function withMapsLocked<T>(
  mapIds: string[],
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    for (const mapId of [...new Set(mapIds)].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${mapId}))`;
    }
    return fn(tx);
  });
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
