/**
 * Stopping the backend cleanly on SIGTERM or SIGINT.
 *
 * Docker stops a container by sending SIGTERM to its first process, which in
 * the production image is node itself: start.sh hands over to it with exec.
 * The first process of a container ignores any signal it has no handler for,
 * so without these handlers every stop and every upgrade waited Docker's ten
 * seconds and ended in SIGKILL. A service manager, or Ctrl+C, sends the same
 * signals to a backend run without Docker.
 *
 * A backup the dashboard is writing when the signal arrives is let finish
 * first, for up to BACKUP_WAIT_MS; docker-compose.yml gives the backend
 * container that long and more before Docker stops it. Stopped part-way, the
 * backup would be lost and have to be made again.
 *
 * The personal files of an account just deleted are removed after the answer
 * has gone out; a shutdown lets that finish too, for up to FILE_WAIT_MS, since
 * the database is needed to decide which files may go.
 *
 * Also here: an error nothing caught, thrown or rejected, which ends the
 * process (onProcessFailure).
 */

import winston from 'winston';
import logger from './logger';

/** What a shutdown closes, in this order. */
export interface ShutdownTargets {
  /**
   * The Socket.io server. Closing it disconnects every socket, stops the HTTP
   * server it is attached to from accepting connections, and calls back once
   * the requests in progress have finished.
   */
  io: { close(callback?: (err?: Error) => void): unknown };
  prisma: { $disconnect(): Promise<void> };
  sessionPool: { end(): Promise<void> };
  /** Backups being written, which the shutdown lets finish before it closes the database. */
  backups?: { readonly count: number; finished(): Promise<void> };
  /** Files of deleted accounts being removed, which the shutdown lets finish before it closes the database. */
  files?: { readonly count: number; finished(): Promise<void> };
}

export interface ShutdownOptions {
  /** How the process ends; the default writes out the log files first. */
  exit?: (code: number) => void;
  /** How long the shutdown may take before the process exits anyway. */
  graceMs?: number;
  /** How long it waits for a backup being written, before the grace above starts. */
  backupWaitMs?: number;
  /** How long it waits, within the grace, for the files of deleted accounts being removed. */
  fileWaitMs?: number;
}

/**
 * Inside Docker's ten-second stop timeout, so the process ends on its own
 * terms, log lines written, before Docker would kill it.
 */
export const SHUTDOWN_GRACE_MS = 8_000;

/**
 * The longest a shutdown waits for the files of a deleted account being
 * removed: within the grace above, so the database is still closed, log lines
 * written, before Docker would stop the container.
 */
export const FILE_WAIT_MS = 4_000;

/**
 * The longest a shutdown waits for a backup being written: the ten minutes
 * the bundled nginx gives the dashboard's request for one.
 */
export const BACKUP_WAIT_MS = 10 * 60_000;

/** The longest the default exit waits for the log files to be written. */
const LOG_FLUSH_MS = 1_000;

/**
 * Set once exitAfterLogs has closed the logger. A line written to it after
 * that throws, so whatever is reported then goes to the console.
 */
let logClosed = false;

/**
 * A line for the log, or for the console once the log is closed: a second
 * signal, or a step that finishes after the deadline has exited, arrives
 * while the log files are being written.
 */
function say(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
  if (!logClosed) {
    if (meta === undefined) logger[level](message);
    else logger[level](message, meta);
    return;
  }
  const write = level === 'info' ? console.log : console.error;
  if (meta === undefined) write(message);
  else write(message, meta);
}

function exitAfterLogs(code: number): void {
  const files = logger.transports.filter((t) => t instanceof winston.transports.File);
  const written = files.map((t) => new Promise<void>((resolve) => t.once('finish', () => resolve())));
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, LOG_FLUSH_MS).unref());
  logClosed = true;
  logger.end();
  void Promise.race([Promise.all(written), timeout]).then(() => process.exit(code));
}

/**
 * A shutdown that runs once, whichever signals arrive and however often.
 * The promise it returns settles when the shutdown has finished.
 */
export function createShutdown(targets: ShutdownTargets, options: ShutdownOptions = {}): (signal: string) => Promise<void> {
  const exit = options.exit ?? exitAfterLogs;
  const graceMs = options.graceMs ?? SHUTDOWN_GRACE_MS;
  const backupWaitMs = options.backupWaitMs ?? BACKUP_WAIT_MS;
  const fileWaitMs = options.fileWaitMs ?? FILE_WAIT_MS;
  let running: Promise<void> | null = null;

  return (signal) => {
    if (running) {
      say('info', `${signal} received while already shutting down`);
      return running;
    }
    say('info', `${signal} received; shutting down`);

    let ended = false;
    const end = (code: number) => {
      if (ended) return;
      ended = true;
      exit(code);
    };
    const backupRunning = (targets.backups?.count ?? 0) > 0;
    const allowedMs = graceMs + (backupRunning ? backupWaitMs : 0);
    const deadline = setTimeout(() => {
      say('warn', `Shutdown not finished after ${allowedMs / 1000} seconds; exiting anyway`);
      end(1);
    }, allowedMs);
    deadline.unref();

    let failed = false;
    const step = async (what: string, run: () => Promise<void>) => {
      try {
        await run();
      } catch (err) {
        failed = true;
        say('error', `Shutdown could not ${what}`, { err });
      }
    };

    running = (async () => {
      // Closing the server stops new requests, and so new backups, at once;
      // it finishes when the requests in progress have.
      const serverClosed = new Promise<void>((resolve) => void targets.io.close(() => resolve()));
      if (backupRunning && targets.backups) {
        say('warn', `A backup is being written; waiting up to ${backupWaitMs / 60_000} minutes for it to finish before stopping`);
        let timer: NodeJS.Timeout | undefined;
        const finished = await Promise.race([
          targets.backups.finished().then(() => true),
          new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), backupWaitMs); }),
        ]);
        clearTimeout(timer);
        if (finished) say('info', 'The backup has finished');
        else say('warn', 'The backup did not finish in time and is lost; make it again once the backend is back');
      }
      await step('close the server', () => serverClosed);
      if (targets.files && targets.files.count > 0) {
        let timer: NodeJS.Timeout | undefined;
        const finished = await Promise.race([
          targets.files.finished().then(() => true),
          new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), fileWaitMs); }),
        ]);
        clearTimeout(timer);
        if (!finished) {
          say('warn', `The files of a deleted account were still being removed after ${fileWaitMs / 1000} seconds; the ones not reached stay as assets with no owner, which an administrator can delete`);
        }
      }
      await step('disconnect from the database', () => targets.prisma.$disconnect());
      await step('close the session store', () => targets.sessionPool.end());
      clearTimeout(deadline);
      say('info', 'Shutdown complete');
      end(failed ? 1 : 0);
    })();
    return running;
  };
}

/** Runs the shutdown on SIGTERM and SIGINT. */
export function onShutdownSignals(
  shutdown: (signal: string) => unknown,
  target: { on(event: string, listener: () => void): unknown } = process
): void {
  for (const signal of ['SIGTERM', 'SIGINT']) {
    target.on(signal, () => {
      void shutdown(signal);
    });
  }
}

/**
 * An error nothing caught, thrown or rejected, ends the process with 1 as
 * Node ends it, but written to the log first. Node's own report went to the
 * console alone, never to the log files, and a rejection nobody handled
 * looked the same as any other crash. Docker starts the backend again.
 *
 * Exiting closes the log. An error that arrives after that, while this exit
 * or a shutdown's writes out the log files, goes to the console instead, and
 * the exit already under way ends the process.
 */
export function onProcessFailure(
  target: { on(event: string, listener: (value: unknown) => void): unknown } = process,
  exit: (code: number) => void = exitAfterLogs
): void {
  let exiting = false;
  const fail = (what: string) => (value: unknown) => {
    if (exiting || logClosed) {
      console.error(`${what} while stopping`, value);
      return;
    }
    exiting = true;
    logger.error(`${what}; stopping`, { err: value });
    exit(1);
  };
  target.on('uncaughtException', fail('Uncaught exception'));
  target.on('unhandledRejection', fail('Unhandled promise rejection'));
}
