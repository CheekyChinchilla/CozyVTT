/**
 * useKeyboardInset
 * How many pixels of the screen's foot an on-screen keyboard covers, 0 when
 * none does.
 *
 * Safari on an iPhone lays the keyboard over the page and leaves the page
 * its size, so whatever stands on the foot of the screen goes under the
 * keyboard. The visible part of the page (`window.visualViewport`) shrinks
 * instead: what the keyboard covers is the page's height less the visible
 * part and how far it is scrolled down. Chrome on Android resizes the page
 * itself (`interactive-widget=resizes-content` in index.html), which leaves
 * 0. A strip under 80 pixels, such as a browser's own bar, is no keyboard.
 */

import { useEffect, useState } from 'react';

/** Less than this is a browser's bar, not a keyboard. */
const KEYBOARD_MIN_PX = 80;

function covered(): number {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  const inset = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
  return inset >= KEYBOARD_MIN_PX ? inset : 0;
}

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(covered);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const update = () => setInset(covered());
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    update();
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}
