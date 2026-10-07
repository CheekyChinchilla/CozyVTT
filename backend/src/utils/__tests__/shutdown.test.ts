/**
 * Stopping the backend on SIGTERM and SIGINT.
 *
 * Docker stops a container by sending SIGTERM to its first process, which in
 * the production image is node itself. The first process of a container
 * ignores a signal it has no handler for, and the backend had none, so every
 * stop and every upgrade waited Docker's ten seconds and ended in SIGKILL,
 * with sockets cut and nothing closed. A service manager, or Ctrl+C, sends the
 * same signals to a backend run without Docker.
 */

import { EventEmitter } from 'events';
import { createShutdown, onShutdownSignals, SHUTDOWN_GRACE_MS, type ShutdownTargets } from '../shutdown';

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
