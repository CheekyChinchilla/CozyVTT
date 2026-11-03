/**
 * Pages as tall as a phone's browser shows them, and taps that count at once.
 *
 * `min-h-screen` (100vh) is the height without a phone's toolbar, so the foot
 * of a short page sat under the toolbar and the page scrolled. Every page is
 * `min-h-page`: the height the browser shows (dvh) less the insets the body
 * pads by for a notch and the home indicator (safeAreas.test.ts). The body
 * takes no double-tap zoom on a button and no wait before a tap counts.
 */

import { describe, it, expect } from 'vitest';
import indexCss from '../index.css?raw';

const sources = import.meta.glob(['../**/*.tsx', '../**/*.ts', '!../**/__tests__/**', '!../test/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('the pages\' height', () => {
  it('is never the screen\'s without its toolbar, nor the browser\'s without the body\'s insets', () => {
    const found = Object.entries(sources).flatMap(([file, text]) => (/\bmin-h-(screen|dvh)\b/.test(text) ? [file] : []));
    expect(found).toEqual([]);
    expect(Object.values(sources).some((text) => /\bmin-h-page\b/.test(text))).toBe(true);
  });

  it('is the browser\'s height less the insets, from one utility', () => {
    const rule = /@utility min-h-page \{([^}]*)\}/.exec(indexCss)?.[1] ?? '';
    expect(rule).toContain('min-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom));');
  });

  it('has the body as tall as the browser shows it, with taps that count at once', () => {
    const body = /\n {2}body \{([^}]*)\}/.exec(indexCss)?.[1] ?? '';
    expect(body).toContain('min-height: 100dvh;');
    expect(body).toContain('touch-action: manipulation;');
  });
});
