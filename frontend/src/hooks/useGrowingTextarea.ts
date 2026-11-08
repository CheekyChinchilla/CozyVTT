import { useLayoutEffect, type RefObject } from 'react';

/** A line of `text-sm`, for a browser that gives the box no line height. */
export const GROW_FALLBACK_LINE_PX = 20;

const px = (value: string) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * A text box as tall as what is typed in it, up to `maxLines` lines, past
 * which it scrolls inside itself. It is measured after each change, which
 * every browser can do; it shrinks back as the text gets shorter or is sent.
 * The box keeps any minimum height its classes give it.
 */
export function useGrowingTextarea(ref: RefObject<HTMLTextAreaElement | null>, value: string, maxLines: number) {
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    // Measured at its natural height, so a shorter text can shrink it.
    box.style.height = 'auto';
    const style = getComputedStyle(box);
    const line = px(style.lineHeight) || GROW_FALLBACK_LINE_PX;
    const borders = px(style.borderTopWidth) + px(style.borderBottomWidth);
    const padding = px(style.paddingTop) + px(style.paddingBottom);
    const most = line * maxLines + padding + borders;
    // scrollHeight holds the padding and not the borders, and the box is border-box.
    const wanted = box.scrollHeight + borders;
    box.style.height = `${Math.min(wanted, most)}px`;
    box.style.overflowY = wanted > most ? 'auto' : 'hidden';
  }, [ref, value, maxLines]);
}
