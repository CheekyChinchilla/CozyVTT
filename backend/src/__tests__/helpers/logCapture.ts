/**
 * Captures what the backend logger writes, as the JSON lines production
 * writes to its log files.
 *
 * A stream transport is added to the real logger, so every format the logger
 * applies runs first and a test sees exactly what a self-hoster's log file
 * would hold. Spying on `logger.error` instead would show only the arguments,
 * before anything has been added, masked or dropped.
 */

import { Writable } from 'stream';
import winston from 'winston';
import logger from '../../utils/logger';

export type LogEntry = Record<string, unknown>;

export interface LogCapture {
  /** The raw lines written so far. */
  readonly lines: string[];
  /** Waits for writes in flight and returns the entries written so far. */
  entries(): Promise<LogEntry[]>;
  /** Stops capturing and returns every entry written. */
  stop(): Promise<LogEntry[]>;
}

/** Lets writes the logger has queued reach the transport. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

export function captureLogs(): LogCapture {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const transport = new winston.transports.Stream({ stream, format: winston.format.json() });
  logger.add(transport);

  const parse = () => lines.map((line) => JSON.parse(line) as LogEntry);

  return {
    lines,
    async entries() {
      await settle();
      return parse();
    },
    async stop() {
      await settle();
      logger.remove(transport);
      return parse();
    },
  };
}

/** A field of a log entry that is itself an object, for reading nested fields. */
export function objectField(entry: LogEntry, key: string): LogEntry {
  const value = entry[key];
  if (typeof value !== 'object' || value === null) {
    throw new Error(`log entry field "${key}" is not an object: ${JSON.stringify(value)}`);
  }
  return value as LogEntry;
}
