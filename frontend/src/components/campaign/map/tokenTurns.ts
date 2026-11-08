// ============================================
// Turning a token, one request at a time. A turn shows at once; while one
// of a token's turns waits for the server, a newer one waits behind it, and
// only the newest, so the server stores the facing pressed last. A refused
// turn puts back the facing the server last stored, once no newer turn of
// that token is still to go.
// ============================================

/** The token a turn is for, on the map it was made on. */
export interface TurnTarget {
  campaignId: string;
  mapId: string;
  tokenId: string;
}

export interface TokenTurnsOptions {
  /** Ask the server to store the token's facing. */
  send: (target: TurnTarget, rotation: number) => Promise<unknown>;
  /** Draw the token at a facing. */
  show: (target: TurnTarget, rotation: number) => void;
  /** The server refused a turn; the facing it last stored is already shown again. */
  refused: (err: unknown) => void;
}

export interface TokenTurns {
  /**
   * Turn a token to `rotation`. `shown` is its facing on screen now, taken as
   * the stored one when none of its turns is waiting.
   */
  turn(target: TurnTarget, rotation: number, shown: number): void;
}

interface Pending {
  target: TurnTarget;
  /** The facing the server last stored. */
  stored: number;
  /** A newer facing to send once the one on its way is answered. */
  next: number | null;
}

export function createTokenTurns({ send, show, refused }: TokenTurnsOptions): TokenTurns {
  const pending = new Map<string, Pending>();
  const keyOf = (target: TurnTarget) => `${target.mapId}:${target.tokenId}`;

  const sendNow = (entry: Pending, rotation: number) => {
    send(entry.target, rotation).then(
      () => settle(entry, rotation, null),
      (err: unknown) => settle(entry, null, err),
    );
  };

  /** One request answered: send the newest waiting, or end with the stored facing shown. */
  const settle = (entry: Pending, storedNow: number | null, err: unknown) => {
    if (storedNow !== null) entry.stored = storedNow;
    if (entry.next !== null) {
      const next = entry.next;
      entry.next = null;
      sendNow(entry, next);
      return;
    }
    pending.delete(keyOf(entry.target));
    if (storedNow === null) {
      show(entry.target, entry.stored);
      refused(err);
    }
  };

  return {
    turn(target, rotation, shown) {
      show(target, rotation);
      const key = keyOf(target);
      const entry = pending.get(key);
      if (entry) {
        entry.next = rotation;
        return;
      }
      const fresh: Pending = { target, stored: shown, next: null };
      pending.set(key, fresh);
      sendNow(fresh, rotation);
    },
  };
}
