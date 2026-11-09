/**
 * A phone with a notch or a home indicator: the page runs under them
 * (`viewport-fit=cover`), and everything keeps clear of them.
 *
 * Without `viewport-fit=cover` the browser keeps the page inside the safe
 * area itself, and every `env(safe-area-inset-*)` the compact layout pads by
 * is 0, so a home-screen app's status bar and a phone on its side's notch
 * were left to the browser. Every page but the table pads by the insets at
 * the body; the table pads its own top, and its bar, sheets, header, dock and
 * strips their own sides and foot. Chrome on Android resizes the page for
 * the on-screen keyboard (`interactive-widget=resizes-content`).
 *
 * jsdom has no insets, so what is checked is that the rules are in place; a
 * real phone shows the result.
 */

import { describe, it, expect } from 'vitest';
import indexHtml from '../../index.html?raw';
import indexCss from '../index.css?raw';
import campaignPage from '../pages/CampaignPage.tsx?raw';

describe('the safe areas', () => {
  it('lets the page run under a notch, and Chrome on Android resize it for the keyboard', () => {
    const viewport = /<meta name="viewport" content="([^"]+)"/.exec(indexHtml)?.[1] ?? '';
    expect(viewport.split(/,\s*/)).toEqual(expect.arrayContaining(['width=device-width', 'viewport-fit=cover', 'interactive-widget=resizes-content']));
  });

  it('pads every page but the table by the insets, at the body', () => {
    const rule = /body:not\(:has\(\[data-table-page\]\)\)\s*\{([^}]*)\}/.exec(indexCss)?.[1] ?? '';
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(rule).toContain(`padding-${side}: env(safe-area-inset-${side})`);
    }
  });

  it('has the table pad its own top, its parts their sides and foot', () => {
    expect(campaignPage).toContain('data-table-page=""');
    expect(campaignPage).toContain('pt-[env(safe-area-inset-top)]');
  });
});
