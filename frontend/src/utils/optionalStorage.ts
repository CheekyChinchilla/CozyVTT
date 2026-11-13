/**
 * The browser's localStorage, for what a page can do without: a remembered
 * tab, panel sizes, a notice already dismissed.
 *
 * A browser can refuse storage (blocked site data, some private windows),
 * and then even reading `window.localStorage` throws, which took the
 * campaign page down. Here a refused read answers null and a refused or
 * full write keeps nothing, so the page carries on with its defaults.
 */
export const optionalStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Refused or full: the choice lasts as long as the page.
    }
  },
};

/**
 * The same for this tab's sessionStorage, for what belongs to one tab and
 * should survive its reload: a map the GM is preparing there, which a second
 * tab of theirs does not share.
 */
export const optionalSessionStorage = {
  getItem(key: string): string | null {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      // Refused or full: it lasts as long as the page.
    }
  },
  removeItem(key: string): void {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Refused: nothing was kept.
    }
  },
};
