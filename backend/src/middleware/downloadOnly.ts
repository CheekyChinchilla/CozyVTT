import type { Request, Response, NextFunction } from 'express';

/**
 * Refuse a request the browser makes to load a page resource: a picture, a
 * frame, a script, a style sheet. An export is fetched by the app or opened
 * directly; loaded into a page it would have the server build a whole archive
 * on the viewer's cookies, once per load. Browsers say what a request is for
 * in Sec-Fetch-Dest: the app's fetch sends `empty` and a direct visit
 * `document`. A script sends no such header and is served as before.
 */
export function downloadOnly(req: Request, res: Response, next: NextFunction): void {
  const dest = req.get('Sec-Fetch-Dest');
  if (dest && dest !== 'empty' && dest !== 'document') {
    res.status(403).json({
      error: 'Forbidden',
      message: 'An export is downloaded by the app or opened directly, not loaded into a page',
    });
    return;
  }
  next();
}
