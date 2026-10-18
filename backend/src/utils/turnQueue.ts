/**
 * Turns in this process, by key. A caller waits here for the one before it,
 * holding nothing, and only then opens its transaction: a database lock waits
 * inside a transaction, so a line of callers behind one key each held a pooled
 * connection, and a burst against one map or one campaign could take the
 * whole pool from every other request. The database lock still covers any
 * other process using the same database.
 */
export interface TurnQueue {
  /** Wait for this key's turn; the returned function hands it to the next caller. */
  turnFor(key: string): Promise<() => void>;
  /** How many callers are waiting their turn for a key, not counting the one whose turn it is. */
  waitingFor(key: string): number;
}

export function createTurnQueue(): TurnQueue {
  const lastInLine = new Map<string, Promise<void>>();
  const waiting = new Map<string, number>();
  return {
    waitingFor: (key) => waiting.get(key) ?? 0,
    async turnFor(key) {
      const before = lastInLine.get(key) ?? Promise.resolve();
      let release!: () => void;
      const mine = new Promise<void>((resolve) => { release = resolve; });
      const tail = before.then(() => mine);
      lastInLine.set(key, tail);
      waiting.set(key, (waiting.get(key) ?? 0) + 1);
      try {
        await before;
      } finally {
        const left = (waiting.get(key) ?? 1) - 1;
        if (left > 0) waiting.set(key, left);
        else waiting.delete(key);
      }
      return () => {
        release();
        if (lastInLine.get(key) === tail) lastInLine.delete(key);
      };
    },
  };
}
