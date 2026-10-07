/**
 * Prisma's own error log.
 *
 * Prisma printed every query error to stderr itself, which Docker keeps in
 * the container log. A validation error quotes the query's arguments in full,
 * so a value a client sent, of any size, or an email address, reached that
 * log unmasked and unclipped: the one path around the project logger. Its
 * errors and warnings now go through the logger like every other line.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { prisma } from '../database';
import { captureLogs, type LogEntry } from '../../__tests__/helpers/logCapture';

/** Every write to the terminal while `run` runs, by any route: console or the streams. */
async function printedDuring(run: () => Promise<void>): Promise<string> {
  const printed: string[] = [];
  const record = (...args: unknown[]) => {
    printed.push(args.map((a) => (typeof a === 'string' ? a : a instanceof Uint8Array ? Buffer.from(a).toString() : String(a))).join(' '));
  };
  const spies = [
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => (record(chunk), true)),
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => (record(chunk), true)),
    ...(['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(record)
    ),
  ];
  try {
    await run();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  return printed.join('\n');
}

it('writes a query error through the logger, clipped, and never prints it raw', async () => {
  const sent = 'Z'.repeat(20_000);
  const logs = captureLogs();

  const printed = await printedDuring(async () => {
    await expect(
      prisma.character.findUnique({ where: { id: { sent } as unknown as string } })
    ).rejects.toThrow('Invalid `prisma.character.findUnique()` invocation');
  });
  const entries = await logs.stop();

  expect(printed).not.toContain(sent);
  expect(logs.lines.join('')).not.toContain(sent);

  const logged = entries.find((e: LogEntry) => e.message === 'Database error');
  expect(logged).toMatchObject({ level: 'error', target: 'character.findUnique' });
  const detail = String(logged?.detail);
  expect(detail).toContain('Invalid `prisma.character.findUnique()` invocation');
  expect(detail).toContain('Argument `id`: Invalid value provided');
  expect(detail).toMatch(/characters left out/);
});
