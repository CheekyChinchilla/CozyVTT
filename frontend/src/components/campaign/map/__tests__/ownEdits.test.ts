import { describe, it, expect } from 'vitest';
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
