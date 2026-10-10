import { describe, it, expect, afterEach } from 'vitest';
import { randomId } from '../uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomId', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
  afterEach(() => {
    if (original) Object.defineProperty(globalThis.crypto, 'randomUUID', original);
    else delete (globalThis.crypto as { randomUUID?: unknown }).randomUUID;
  });

  it('uses crypto.randomUUID where the page has it', () => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: () => 'from-the-browser', configurable: true });
    expect(randomId()).toBe('from-the-browser');
  });

  it('makes a version 4 UUID without it, as on a page served over plain HTTP', () => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    const ids = new Set(Array.from({ length: 200 }, () => randomId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });
});
