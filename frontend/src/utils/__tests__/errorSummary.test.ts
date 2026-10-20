/**
 * The line a caught error is logged as.
 *
 * A request error is logged as its status and message, never whole, since it
 * carries the request it answered. A sheet editor's save also catches errors
 * its own code throws while building the sheet, and those lost their stack,
 * which is what a developer needs and holds no request.
 */
import { describe, it, expect } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { errorSummary } from '../errors';

describe('errorSummary', () => {
  it('logs a request error as its status and the server\'s message, and nothing of the request', () => {
    const config = { headers: new AxiosHeaders(), data: JSON.stringify({ password: 'hunter2' }) };
    const err = new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, {}, {
      status: 400, statusText: 'Bad Request', headers: {}, config, data: { message: 'Validation Error' },
    });
    const line = errorSummary(err);
    expect(line).toBe('400 Validation Error');
    expect(line).not.toContain('hunter2');
  });

  it('keeps the stack of an error the page\'s own code threw', () => {
    let thrown: unknown;
    try {
      (undefined as unknown as { slots: number[] }).slots.map(Number);
    } catch (err) {
      thrown = err;
    }
    const line = errorSummary(thrown);
    expect(line).toContain((thrown as Error).message);
    expect(line).toContain((thrown as Error).stack?.split('\n')[1]?.trim() ?? 'missing stack');
  });
});
