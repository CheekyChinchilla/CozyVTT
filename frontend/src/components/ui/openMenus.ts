// ============================================
// A menu opened elsewhere closes the map's
//
// The map's token and door menus close on a click anywhere in the window.
// A right-click or a long-press sends no click, so one that opened the
// roster's or the initiative tracker's menu left the map's open beside it.
// A menu says it has opened (`menuOpened`), and the map's menus, while one is
// open, close when it does (`whenMenuOpens`).
// ============================================

const listeners = new Set<() => void>();

/** A menu has opened: whatever is listening closes. */
export function menuOpened(): void {
  for (const close of [...listeners]) close();
}

/** Calls `close` each time a menu opens. Returns what stops it. */
export function whenMenuOpens(close: () => void): () => void {
  listeners.add(close);
  return () => {
    listeners.delete(close);
  };
}
