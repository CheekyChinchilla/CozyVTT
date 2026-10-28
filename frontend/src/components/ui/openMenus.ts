// ============================================
// The menus over the page, as the map needs to know them
//
// A menu opened elsewhere closes the map's. The map's token and door menus
// close on a click anywhere in the window. A right-click or a long-press
// sends no click, so one that opened the roster's or the initiative
// tracker's menu left the map's open beside it. A menu says it has opened
// (`menuOpened`), and the map's menus, while one is open, close when it does
// (`whenMenuOpens`).
//
// Whether a menu is on the screen. A tap on the map while a menu is open
// closes the menu, which is all it was for, so it is not the first of a
// double tap to ping. A menu that a press outside closes says it is shown
// (`menuShown`) until it goes, and the map asks (`anyMenuShown`) as each
// press lands, before anything on the page hears it, so a menu may close on
// the pointerdown itself or on the mousedown or click after it.
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

const shown = new Set<object>();

/** A menu is on the screen until what this returns is called; calling that again does nothing. */
export function menuShown(): () => void {
  const menu = {};
  shown.add(menu);
  return () => {
    shown.delete(menu);
  };
}

/** Whether any menu is on the screen. */
export function anyMenuShown(): boolean {
  return shown.size > 0;
}
