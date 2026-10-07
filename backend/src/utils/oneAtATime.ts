import type { NextFunction, Request, Response } from 'express';

/**
 * Middleware that lets one request per key run at a time and answers 429 to
 * another that arrives while it is still going.
 *
 * For routes whose work holds a whole upload in memory: the rate limiter
 * counts requests per minute, not how many are in flight, so a few large ones
 * sent together get past it. The slot is released when the response ends or
 * the connection closes, so requests sent one after another are never held
 * back, however fast.
 *
 * Place it before the body is read, so a refused request buffers nothing.
 */
export function oneAtATime(
  keyOf: (req: Request) => string | undefined,
  message: string
): (req: Request, res: Response, next: NextFunction) => void {
  const running = new Set<string>();

  return (req, res, next) => {
    const key = keyOf(req);
    if (!key) {
      next();
      return;
    }
    if (running.has(key)) {
      res.status(429).json({ error: 'Too Many Requests', message });
      return;
    }
    running.add(key);
    const release = () => {
      running.delete(key);
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}
