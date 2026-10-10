import { describe, it, expect, afterEach } from 'vitest';
import { createOwnEdits } from '../ownEdits';

describe('createOwnEdits', () => {
  it('tags a payload with a fresh id and knows its echo once', () => {
    const own = createOwnEdits();
    const a = own.tag({ mapId: 'm', segmentId: 's' });
    const b = own.tag({ mapId: 'm', segmentId: 's' });

    expect(a).toMatchObject({ mapId: 'm', segmentId: 's' });
    expect(typeof a.opId).toBe('string');
    expect(a.opId).not.toBe(b.opId);
    expect(own.isOwn({ opId: a.opId })).toBe(true);
    expect(own.isOwn({ opId: a.opId })).toBe(false);
    expect(own.isOwn({ opId: b.opId })).toBe(true);
  });

  it('takes an event with no id, or one it never sent, as someone else\'s', () => {
    const own = createOwnEdits();
    own.tag({});
    expect(own.isOwn({})).toBe(false);
    expect(own.isOwn({ opId: 'from-another-page' })).toBe(false);
    expect(own.isOwn({ opId: 42 })).toBe(false);
  });

  it('forgets the oldest ids once it holds 500', () => {
    let n = 0;
    const own = createOwnEdits(() => `op-${n++}`);
    for (let i = 0; i < 501; i += 1) own.tag({});

    expect(own.isOwn({ opId: 'op-0' })).toBe(false);
    expect(own.isOwn({ opId: 'op-1' })).toBe(true);
    expect(own.isOwn({ opId: 'op-500' })).toBe(true);
  });
});

describe('createOwnEdits on a page served over plain HTTP', () => {
  // crypto.randomUUID exists only on HTTPS or localhost. A player who opens
  // CozyVTT by its address on a home network, over plain HTTP, has none, and
  // every tagged wall edit, a door toggle included, failed before it was sent.
  const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
  afterEach(() => {
    if (original) Object.defineProperty(globalThis.crypto, 'randomUUID', original);
    else delete (globalThis.crypto as { randomUUID?: unknown }).randomUUID;
  });

  it('still tags edits with distinct ids', () => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    const own = createOwnEdits();
    const a = own.tag({ mapId: 'm' });
    const b = own.tag({ mapId: 'm' });

    expect(a.opId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a.opId).not.toBe(b.opId);
    expect(own.isOwn({ opId: a.opId })).toBe(true);
  });
});
