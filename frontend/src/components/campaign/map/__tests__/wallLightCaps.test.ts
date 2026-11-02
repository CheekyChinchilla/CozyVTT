/**
 * The caps the wall and light tools keep to before they draw, and the
 * server's answer to what they sent. The tools themselves are in
 * MapCanvasWallLightCaps.test.tsx.
 */

import { describe, it, expect } from 'vitest';
import { pastWallCap, atLightCap, refusalIn, WallSendLog } from '../wallLightCaps';
import { MAP_LIMITS } from '@/constants/mapLimits';

const WALLS = MAP_LIMITS.maxWallSegments;

describe('pastWallCap', () => {
  it('lets a map fill up to its cap, and no further', () => {
    expect(pastWallCap(WALLS - 1, WALLS)).toBe(false);
    expect(pastWallCap(WALLS, WALLS + 1)).toBe(true);
    expect(pastWallCap(WALLS - 1, WALLS + 2)).toBe(true);
  });

  it('lets an edit at the cap that adds nothing through, such as a move', () => {
    expect(pastWallCap(WALLS, WALLS)).toBe(false);
  });

  it('lets a map stored past the cap lose walls, and never gain one', () => {
    expect(pastWallCap(WALLS + 10, WALLS + 9)).toBe(false);
    expect(pastWallCap(WALLS + 10, WALLS + 11)).toBe(true);
  });
});

describe('atLightCap', () => {
  it('has room until the map holds as many lights as it may', () => {
    expect(atLightCap(MAP_LIMITS.maxLightSources - 1)).toBe(false);
    expect(atLightCap(MAP_LIMITS.maxLightSources)).toBe(true);
  });
});

describe('refusalIn', () => {
  it("is the server's reason for a refusal", () => {
    expect(refusalIn({ ok: false, error: 'Map not found' })).toBe('Map not found');
  });

  it('is nothing for an answer that stored the edit, or anything else', () => {
    expect(refusalIn({ ok: true })).toBeNull();
    expect(refusalIn(undefined)).toBeNull();
    expect(refusalIn('no')).toBeNull();
    expect(refusalIn({ error: 'no ok' })).toBeNull();
  });

  it('still refuses when a refusal carries no reason', () => {
    expect(refusalIn({ ok: false })).toBe('The server refused the change.');
  });
});

describe('WallSendLog', () => {
  /** A log, and the take-backs it has run, by name. */
  function logged() {
    const log = new WallSendLog();
    const taken: string[] = [];
    return { log, taken, back: (name: string) => () => { taken.push(name); } };
  }

  it('takes back a refused edit nothing was sent after', () => {
    const { log, taken, back } = logged();
    const add = log.sent(false);
    log.refused(add, back('add'));
    expect(taken).toEqual(['add']);
  });

  it('holds a refusal while a later list is unanswered, and drops it once that list is stored', () => {
    const { log, taken, back } = logged();
    const add = log.sent(false);
    const list = log.sent(true);
    log.refused(add, back('add'));
    expect(taken).toEqual([]);
    log.stored(list);
    expect(taken).toEqual([]);
  });

  it('drops a refusal that comes after a later list was stored', () => {
    const { log, taken, back } = logged();
    const add = log.sent(false);
    const list = log.sent(true);
    log.stored(list);
    log.refused(add, back('add'));
    expect(taken).toEqual([]);
  });

  it('takes back both, the newest first, when the later list is refused too', () => {
    const { log, taken, back } = logged();
    const add = log.sent(false);
    const list = log.sent(true);
    log.refused(add, back('add'));
    log.refused(list, back('list'));
    expect(taken).toEqual(['list', 'add']);
  });

  it('is not held by a later add, which carries nothing', () => {
    const { log, taken, back } = logged();
    const first = log.sent(false);
    log.sent(false);
    log.refused(first, back('first'));
    expect(taken).toEqual(['first']);
  });

  it('is not saved by a list sent before the refused edit', () => {
    const { log, taken, back } = logged();
    const list = log.sent(true);
    const add = log.sent(false);
    log.stored(list);
    log.refused(add, back('add'));
    expect(taken).toEqual(['add']);
  });

  it('forgets what was sent on the last map', () => {
    const { log, taken, back } = logged();
    const add = log.sent(false);
    log.sent(true);
    log.reset();
    log.refused(add, back('add'));
    expect(taken).toEqual(['add']);
  });
});
