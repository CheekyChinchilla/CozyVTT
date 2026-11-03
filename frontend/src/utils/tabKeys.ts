/**
 * Where a key pressed on tab `index` of a row of `count` tabs moves the open
 * tab: the arrows to the tab before or after, round the ends, and Home and
 * End to the first and the last, as a row of tabs (role="tablist") promises.
 * Null for any other key, which the tab keeps. Every tab row uses it, so they
 * answer the same keys.
 */
export function tabKeyTarget(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowLeft': return (index - 1 + count) % count;
    case 'ArrowRight': return (index + 1) % count;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}
