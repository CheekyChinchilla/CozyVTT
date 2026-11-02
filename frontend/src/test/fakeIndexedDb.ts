/**
 * Just enough of IndexedDB for Paint's draft store (map/paint/paintDrafts.ts)
 * to run in jsdom, which has none: opening a database (upgrade, success,
 * versionchange), transactions of requests run in order a task later, each
 * request's success handler free to add more, and committing or aborting
 * whole. The tests can close a connection as a browser does under a page,
 * make the next request of a kind fail with a named DOMException, and count
 * what was opened and run.
 */

type Value = Record<string, unknown>;

class FakeKeyRange {
  constructor(readonly lower: string, readonly upper: string) {}
  static bound(lower: string, upper: string) {
    return new FakeKeyRange(lower, upper);
  }
  includes(key: string) {
    return key >= this.lower && key <= this.upper;
  }
}

type Key = string | FakeKeyRange | undefined;
const matches = (query: Key, key: string) => (query === undefined ? true : typeof query === 'string' ? query === key : query.includes(key));

class FakeRequest<T = unknown> {
  result: T | undefined = undefined;
  error: DOMException | null = null;
  onsuccess: ((event: { target: FakeRequest<T> }) => void) | null = null;
  onerror: ((event: { target: FakeRequest<T> }) => void) | null = null;
}

export interface FakeIndexedDb {
  factory: IDBFactory;
  /** Run before the store under test is made: puts IDBKeyRange where jsdom has none. */
  install(): void;
  /** Close every open connection as a browser does under a page (onclose fires). */
  closeUnderPage(): void;
  /** Ask every open connection to let go, as a newer version opening in another tab does. */
  newerVersion(): void;
  /** The next request of this kind fails with a DOMException of this name. */
  failNext(kind: 'put' | 'get' | 'getAll' | 'delete', name: string): void;
  /** How often the database was opened, and how many transactions ran. */
  counts: { opened: number; transactions: number };
  /** The records kept, by store. */
  data: Map<string, Map<string, Value>>;
}

export function fakeIndexedDb(): FakeIndexedDb {
  const data = new Map<string, Map<string, Value>>();
  const counts = { opened: 0, transactions: 0 };
  const connections = new Set<FakeConnection>();
  const failures: Array<{ kind: string; name: string }> = [];
  let version = 0;

  class FakeTransaction {
    error: DOMException | null = null;
    oncomplete: (() => void) | null = null;
    onerror: ((event: { target: { error: DOMException } }) => void) | null = null;
    onabort: (() => void) | null = null;
    private queue: Array<() => void> = [];
    private done = false;

    constructor(private readonly stores: string[]) {
      counts.transactions += 1;
      setTimeout(() => this.run(), 0);
    }

    objectStore(name: string) {
      if (!this.stores.includes(name)) throw new DOMException('No such store', 'NotFoundError');
      const records = data.get(name)!;
      const request = <T,>(kind: string, work: () => T) => {
        if (this.done) throw new DOMException('The transaction has finished', 'TransactionInactiveError');
        const req = new FakeRequest<T>();
        this.queue.push(() => {
          const failing = failures.findIndex((f) => f.kind === kind);
          if (failing !== -1) {
            const error = new DOMException('Refused', failures.splice(failing, 1)[0].name);
            req.error = error;
            this.onerror?.({ target: { error } });
            this.abort(error);
            return;
          }
          req.result = work();
          req.onsuccess?.({ target: req });
        });
        return req;
      };
      return {
        get: (key: string) => request('get', () => records.get(key)),
        getAll: (query?: Key) => request('getAll', () => [...records.entries()].filter(([k]) => matches(query, k)).map(([, v]) => v)),
        put: (value: Value) => request('put', () => {
          const keyPath = name === 'drafts' ? 'key' : 'id';
          records.set(String(value[keyPath]), value);
          return value[keyPath];
        }),
        delete: (query: Key) => request('delete', () => {
          for (const k of [...records.keys()]) if (matches(query, k)) records.delete(k);
          return undefined;
        }),
      };
    }

    abort(error: DOMException | null = null) {
      if (this.done) throw new DOMException('The transaction has finished', 'InvalidStateError');
      this.done = true;
      this.error = error;
      this.queue = [];
      setTimeout(() => this.onabort?.(), 0);
    }

    private run() {
      while (this.queue.length > 0 && !this.done) this.queue.shift()!();
      if (this.done) return;
      this.done = true;
      this.oncomplete?.();
    }
  }

  class FakeConnection {
    closed = false;
    onversionchange: (() => void) | null = null;
    onclose: (() => void) | null = null;
    objectStoreNames = { contains: (name: string) => data.has(name) };
    createObjectStore(name: string) {
      data.set(name, new Map());
    }
    transaction(stores: string[]) {
      if (this.closed) throw new DOMException('The database connection is closing', 'InvalidStateError');
      return new FakeTransaction(stores);
    }
    close() {
      this.closed = true;
      connections.delete(this);
    }
  }

  const factory = {
    open(_name: string, wanted: number) {
      const request = new FakeRequest<FakeConnection>() as FakeRequest<FakeConnection> & {
        onupgradeneeded: (() => void) | null;
        onblocked: (() => void) | null;
      };
      request.onupgradeneeded = null;
      request.onblocked = null;
      setTimeout(() => {
        counts.opened += 1;
        const connection = new FakeConnection();
        request.result = connection;
        if (wanted > version) {
          version = wanted;
          request.onupgradeneeded?.();
        }
        connections.add(connection);
        request.onsuccess?.({ target: request });
      }, 0);
      return request;
    },
  };

  return {
    factory: factory as unknown as IDBFactory,
    install() {
      Object.defineProperty(globalThis, 'IDBKeyRange', { value: FakeKeyRange, configurable: true, writable: true });
    },
    closeUnderPage() {
      for (const connection of [...connections]) {
        connection.close();
        connection.onclose?.();
      }
    },
    newerVersion() {
      for (const connection of [...connections]) connection.onversionchange?.();
    },
    failNext(kind, name) {
      failures.push({ kind, name });
    },
    counts,
    data,
  };
}
