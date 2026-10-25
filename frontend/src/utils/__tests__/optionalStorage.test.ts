/**
 * Storage the page can do without answers null, and keeps nothing, when the
 * browser refuses it, where reading `window.localStorage` itself throws.
 */

import { it, expect, afterEach } from 'vitest';
import { optionalStorage } from '../optionalStorage';

const realStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')!;

afterEach(() => {
  Object.defineProperty(window, 'localStorage', realStorage);
  window.localStorage.clear();
});

it('reads and writes localStorage when it is there', () => {
  optionalStorage.setItem('cozyvtt.test', 'kept');
  expect(window.localStorage.getItem('cozyvtt.test')).toBe('kept');
  expect(optionalStorage.getItem('cozyvtt.test')).toBe('kept');
});

it('answers null and keeps nothing when the browser refuses storage', () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
  });

  expect(() => optionalStorage.setItem('cozyvtt.test', 'kept')).not.toThrow();
  expect(optionalStorage.getItem('cozyvtt.test')).toBeNull();
});

it('keeps nothing when storage is full', () => {
  const full = { getItem: () => null, setItem: () => { throw new DOMException('Quota', 'QuotaExceededError'); } };
  Object.defineProperty(window, 'localStorage', { configurable: true, get: () => full });

  expect(() => optionalStorage.setItem('cozyvtt.test', 'kept')).not.toThrow();
});
