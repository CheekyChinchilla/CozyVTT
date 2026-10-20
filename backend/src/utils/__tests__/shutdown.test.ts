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
 * console only, never to the log files. Exiting closes the log, so any that
 * follow while the process stops go to the console.
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createShutdown, onShutdownSignals, onProcessFailure, SHUTDOWN_GRACE_MS, BACKUP_WAIT_MS, FILE_WAIT_MS, type ShutdownTargets } from '../shutdown';
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

/** Files of a deleted account being removed, until `finish` is called. */
function filesBeingRemoved() {
  let finish = () => {};
  const done = new Promise<void>((resolve) => { finish = resolve; });
  let count = 1;
  const files = {
    get count() { return count; },
    finished: () => done,
  };
  return { files, finish: () => { count = 0; finish(); } };
}

describe('a shutdown while the files of a deleted account are being removed', () => {
  it('closes the database only once the removal has finished', async () => {
    const order: string[] = [];
    const t = targets(order);
    const { files, finish } = filesBeingRemoved();
    const exit = jest.fn();
    const withFiles = { ...t, files };
    const done = createShutdown(withFiles, { exit })('SIGTERM');

    await new Promise((resolve) => setImmediate(resolve));
    expect(t.io.close).toHaveBeenCalledTimes(1);
    expect(t.prisma.$disconnect).not.toHaveBeenCalled();

    order.push('files');
    finish();
    await done;
    expect(order).toEqual(['io', 'files', 'prisma', 'sessionPool']);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('waits no longer than its bound, says so in the log, and closes the rest', async () => {
    jest.useFakeTimers();
    const warned = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    try {
      const t = targets();
      const { files } = filesBeingRemoved();
      const exit = jest.fn();
      const withFiles = { ...t, files };
      const done = createShutdown(withFiles, { exit, fileWaitMs: 3000, graceMs: 8000 })('SIGTERM');

      await jest.advanceTimersByTimeAsync(2999);
      expect(t.prisma.$disconnect).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      await done;
      expect(t.prisma.$disconnect).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(0);
      expect(warned).toHaveBeenCalledWith(expect.stringContaining('files'));
    } finally {
      warned.mockRestore();
      jest.useRealTimers();
    }
  });

  it('does not wait when none is being removed', async () => {
    jest.useFakeTimers();
    try {
      const t = targets();
      const exit = jest.fn();
      const withFiles = { ...t, files: { count: 0, finished: () => new Promise<void>(() => {}) } };
      await createShutdown(withFiles, { exit })('SIGTERM');
      expect(exit).toHaveBeenCalledWith(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('waits for less time than the whole shutdown is given', () => {
    expect(FILE_WAIT_MS).toBeLessThan(SHUTDOWN_GRACE_MS);
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

  it('exits once, and writes any that follow to the console, since the first has closed the log', () => {
    // The default exit ends the logger, and a line written to it after that
    // throws; thrown inside this handler, Node would stop at once with 7.
    let logClosed = false;
    const errorLog = jest.spyOn(logger, 'error').mockImplementation(() => {
      if (logClosed) throw new Error('write after end');
      return logger;
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const proc = new EventEmitter();
      const exit = jest.fn(() => { logClosed = true; });
      onProcessFailure(proc, exit);
      const first = new Error('first');
      const second = new Error('second');
      const third = new Error('third');
      proc.emit('unhandledRejection', first);
      proc.emit('unhandledRejection', second);
      proc.emit('uncaughtException', third);

      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(errorLog.mock.calls[0] as unknown[]).toEqual(['Unhandled promise rejection; stopping', { err: first }]);
      expect(consoleError.mock.calls).toEqual([
        ['Unhandled promise rejection while stopping', second],
        ['Uncaught exception while stopping', third],
      ]);
      expect(exit).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(1);
    } finally {
      errorLog.mockRestore();
      consoleError.mockRestore();
    }
  });
});

/**
 * The real logger, as production runs it, in a process of its own: errors in
 * the second it takes to write out the log files and exit.
 */
describe('an error nothing caught, while the backend is stopping', () => {
  interface Ended { code: number | null; stdout: string; stderr: string; errorLog: string; combinedLog: string }

  const child = `
const { onProcessFailure, createShutdown } = require(process.env.SHUTDOWN_MODULE);
onProcessFailure();
setTimeout(() => {
  if (process.argv[2] === 'several') {
    void Promise.reject(new Error('the first, rejected'));
    void Promise.reject(new Error('the second, rejected'));
    process.nextTick(() => { throw new Error('the third, thrown'); });
  } else if (process.argv[2] === 'twice') {
    // A second signal while the first shutdown writes out the log files.
    const targets = { io: { close: (done) => done() }, prisma: { $disconnect: async () => {} }, sessionPool: { end: async () => {} } };
    const shutdown = createShutdown(targets);
    void shutdown('SIGTERM').then(() => shutdown('SIGTERM'));
  } else if (process.argv[2] === 'deadline') {
    // The server closes on the deadline's own timer tick, just after it has
    // exited, so the steps after it report while the log files are written.
    const targets = {
      io: { close: (done) => setTimeout(done, 50) },
      prisma: { $disconnect: async () => { throw new Error('already gone'); } },
      sessionPool: { end: async () => {} },
    };
    void createShutdown(targets, { graceMs: 50 })('SIGTERM');
  } else {
    const targets = { io: { close: (done) => done() }, prisma: { $disconnect: async () => {} }, sessionPool: { end: async () => {} } };
    void createShutdown(targets)('SIGTERM').then(() => process.nextTick(() => { throw new Error('thrown after the shutdown'); }));
  }
}, 0);
`;

  /** Runs the scenario in a folder of its own, where production writes logs/. */
  function run(scenario: 'several' | 'after a shutdown' | 'twice' | 'deadline'): Promise<Ended> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-fatal-'));
    const script = path.join(dir, 'fail.js');
    fs.writeFileSync(script, child);
    const backend = path.resolve(__dirname, '../../..');
    return new Promise<Ended>((resolve, reject) => {
      const proc = spawn(process.execPath, ['-r', require.resolve('ts-node/register/transpile-only'), script, scenario === 'after a shutdown' ? 'shutdown' : scenario], {
        cwd: dir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          LOG_LEVEL: 'info',
          TS_NODE_PROJECT: path.join(backend, 'tsconfig.json'),
          SHUTDOWN_MODULE: path.resolve(__dirname, '../shutdown.ts'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      const giveUp = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error(`the process did not stop:\n${stderr}`));
      }, 20000);
      proc.on('exit', (code) => {
        clearTimeout(giveUp);
        const logFile = path.join(dir, 'logs', 'error.log');
        const errorLog = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
        const combinedFile = path.join(dir, 'logs', 'combined.log');
        const combinedLog = fs.existsSync(combinedFile) ? fs.readFileSync(combinedFile, 'utf8') : '';
        fs.rmSync(dir, { recursive: true, force: true });
        resolve({ code, stdout, stderr, errorLog, combinedLog });
      });
    });
  }

  it('logs the first, writes the rest to the console, and exits 1', async () => {
    const ended = await run('several');

    expect(ended.stderr).not.toContain('write after end');
    expect(ended.code).toBe(1);
    const logged = ended.errorLog.split('\n').filter(Boolean);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/"message":"(Uncaught exception|Unhandled promise rejection); stopping"/);
    expect(ended.stderr.match(/(Uncaught exception|Unhandled promise rejection) while stopping/g)).toHaveLength(2);
    for (const message of ['the first, rejected', 'the second, rejected', 'the third, thrown']) {
      expect(ended.errorLog + ended.stderr).toContain(message);
    }
  }, 30000);

  it('writes one that arrives as a shutdown ends to the console, and exits as the shutdown would', async () => {
    const ended = await run('after a shutdown');

    expect(ended.stderr).not.toContain('write after end');
    expect(ended.code).toBe(0);
    expect(ended.stderr).toContain('Uncaught exception while stopping');
    expect(ended.stderr).toContain('thrown after the shutdown');
  }, 30000);

  it('writes a second signal that arrives while the log files are written to the console', async () => {
    const ended = await run('twice');

    expect(ended.stderr).not.toContain('write after end');
    expect(ended.stderr).not.toContain('while stopping');
    expect(ended.stdout).toContain('SIGTERM received while already shutting down');
    expect(ended.code).toBe(0);
  }, 30000);

  it('writes what the shutdown reports after its deadline has exited to the console', async () => {
    const ended = await run('deadline');

    expect(ended.stderr).not.toContain('write after end');
    expect(ended.stderr).not.toContain('while stopping');
    expect(ended.code).toBe(1);
    expect(ended.combinedLog).toContain('Shutdown not finished after 0.05 seconds; exiting anyway');
    expect(ended.stderr).toContain('Shutdown could not disconnect from the database');
    expect(ended.stdout).toContain('Shutdown complete');
  }, 30000);
});
