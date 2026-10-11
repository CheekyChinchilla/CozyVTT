/**
 * Stopping the backend on SIGTERM and SIGINT.
 *
 * Docker stops a container by sending SIGTERM to its first process, which in
 * the production image is node itself. The first process of a container
 * ignores a signal it has no handler for, and the backend had none, so every
 * stop and every upgrade waited Docker's ten seconds and ended in SIGKILL,
 * with sockets cut and nothing closed. A service manager, or Ctrl+C, sends the
 * same signals to a backend run without Docker.
 *
 * A backup being written when the signal arrives is let finish first, for
 * up to ten minutes, the time the bundled nginx gives the dashboard's request
 * for one; stopped part-way, it is lost and has to be made again.
 *
 * An error nothing caught, thrown or rejected, ends the process with 1 as
 * Node would, but is written to the log first: Node's own report went to the
 * console only, never to the log files.
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { createShutdown, onShutdownSignals, onProcessFailure, SHUTDOWN_GRACE_MS, BACKUP_WAIT_MS, type ShutdownTargets } from '../shutdown';
import logger from '../logger';

function targets(order: string[] = []) {
  const t = {
    io: { close: jest.fn((done?: (err?: Error) => void) => { order.push('io'); done?.(); }) },
    prisma: { $disconnect: jest.fn(async () => { order.push('prisma'); }) },
    sessionPool: { end: jest.fn(async () => { order.push('sessionPool'); }) },
  };
  return t satisfies ShutdownTargets;
}

describe('a shutdown', () => {
  it('closes the server, then the database, then the session store, once each, and exits 0', async () => {
    const order: string[] = [];
    const t = targets(order);
    const exit = jest.fn();
    await createShutdown(t, { exit })('SIGTERM');

    expect(order).toEqual(['io', 'prisma', 'sessionPool']);
    expect(t.io.close).toHaveBeenCalledTimes(1);
    expect(t.prisma.$disconnect).toHaveBeenCalledTimes(1);
    expect(t.sessionPool.end).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('closes nothing twice when a second signal arrives', async () => {
    const t = targets();
    const exit = jest.fn();
    const shutdown = createShutdown(t, { exit });
    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
    await shutdown('SIGTERM');

    expect(t.io.close).toHaveBeenCalledTimes(1);
    expect(t.prisma.$disconnect).toHaveBeenCalledTimes(1);
    expect(t.sessionPool.end).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('still closes the rest when one step fails, and exits 1', async () => {
    const t = targets();
    t.prisma.$disconnect.mockRejectedValueOnce(new Error('already gone'));
    const exit = jest.fn();
    await createShutdown(t, { exit })('SIGTERM');

    expect(t.sessionPool.end).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits 1 at the deadline when something never finishes', async () => {
    jest.useFakeTimers();
    try {
      const t = targets();
      t.io.close.mockImplementation(() => undefined);
      const exit = jest.fn();
      void createShutdown(t, { exit, graceMs: 5000 })('SIGTERM');

      jest.advanceTimersByTime(4999);
      expect(exit).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('gives up inside Docker\'s ten-second stop timeout', () => {
    expect(SHUTDOWN_GRACE_MS).toBeLessThan(10_000);
  });
});

describe('the signals', () => {
  it.each(['SIGTERM', 'SIGINT'])('%s starts a shutdown', (signal) => {
    const proc = new EventEmitter();
    const shutdown = jest.fn(async () => undefined);
    onShutdownSignals(shutdown, proc);
    proc.emit(signal);
    expect(shutdown).toHaveBeenCalledWith(signal);
  });
});

/** A backup that finishes when `finish` is called. */
function backupRunning() {
  let finish = () => {};
  const done = new Promise<void>((resolve) => { finish = resolve; });
  let count = 1;
  const backups = {
    get count() { return count; },
    finished: () => done,
  };
  return { backups, finish: () => { count = 0; finish(); } };
}

describe('a shutdown while a backup is being written', () => {
  it('stops taking requests at once, and closes the database only once the backup has finished', async () => {
    const order: string[] = [];
    const t = targets(order);
    const { backups, finish } = backupRunning();
    const exit = jest.fn();
    const done = createShutdown({ ...t, backups }, { exit })('SIGTERM');

    await new Promise((resolve) => setImmediate(resolve));
    expect(t.io.close).toHaveBeenCalledTimes(1);
    expect(t.prisma.$disconnect).not.toHaveBeenCalled();

    order.push('backup');
    finish();
    await done;
    expect(order).toEqual(['io', 'backup', 'prisma', 'sessionPool']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('waits no longer than its bound, then closes the rest and exits', async () => {
    jest.useFakeTimers();
    try {
      const t = targets();
      const { backups } = backupRunning();
      const exit = jest.fn();
      const done = createShutdown({ ...t, backups }, { exit, backupWaitMs: 60_000, graceMs: 5000 })('SIGTERM');

      await jest.advanceTimersByTimeAsync(59_999);
      expect(t.prisma.$disconnect).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      await done;
      expect(t.prisma.$disconnect).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not wait when no backup is being written', async () => {
    jest.useFakeTimers();
    try {
      const t = targets();
      const exit = jest.fn();
      const backups = { count: 0, finished: () => new Promise<void>(() => {}) };
      await createShutdown({ ...t, backups }, { exit })('SIGTERM');
      expect(exit).toHaveBeenCalledWith(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('waits ten minutes at most, which the backend container allows before Docker stops it', () => {
    expect(BACKUP_WAIT_MS).toBe(10 * 60_000);
    const compose = fs.readFileSync(path.resolve(__dirname, '../../../../docker-compose.yml'), 'utf8');
    const backend = compose.slice(compose.indexOf('\n  backend:'), compose.indexOf('\n  frontend:'));
    const grace = /\n {4}stop_grace_period: (?:(\d+)m)?(?:(\d+)s)?\n/.exec(backend);
    if (!grace) throw new Error('the backend service in docker-compose.yml sets no stop_grace_period');
    const seconds = Number(grace[1] ?? 0) * 60 + Number(grace[2] ?? 0);
    expect(seconds * 1000).toBeGreaterThan(BACKUP_WAIT_MS + SHUTDOWN_GRACE_MS);
  });
});

describe('an error nothing caught', () => {
  it.each([
    ['uncaughtException', new Error('thrown and never caught')],
    ['unhandledRejection', new Error('rejected and never handled')],
  ])('on %s is written to the log, and the process exits 1', (event, error) => {
    const errorLog = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    try {
      const proc = new EventEmitter();
      const exit = jest.fn();
      onProcessFailure(proc, exit);
      proc.emit(event, error);

      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(errorLog.mock.calls[0] as unknown[]).toEqual([expect.stringMatching(/; stopping$/), { err: error }]);
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      errorLog.mockRestore();
    }
  });

  it('exits once, however many arrive while the log is written', () => {
    const errorLog = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    try {
      const proc = new EventEmitter();
      const exit = jest.fn();
      onProcessFailure(proc, exit);
      proc.emit('unhandledRejection', new Error('first'));
      proc.emit('uncaughtException', new Error('second'));

      expect(errorLog).toHaveBeenCalledTimes(2);
      expect(exit).toHaveBeenCalledTimes(1);
    } finally {
      errorLog.mockRestore();
    }
  });
});
