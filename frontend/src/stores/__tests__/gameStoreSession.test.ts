/**
 * The session rail's open tab and the chat's unread count, kept in the game
 * store so the tab bar and the panels read one value wherever the page draws
 * them.
 *
 * The open tab is remembered under the key the rail has always used, so a
 * browser that had the Dice tab open before the upgrade opens on Dice after
 * it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const KEY = 'cozyvtt-session-tab';

/** The store as a page that has just loaded finds it, with this browser's storage as it is now. */
async function freshStore() {
  vi.resetModules();
  return (await import('../gameStore')).useGameStore;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('the open session tab', () => {
  it('starts on the tab this browser last had open, under the key the rail used', async () => {
    window.localStorage.setItem(KEY, 'dice');

    const store = await freshStore();

    expect(store.getState().sessionTab).toBe('dice');
  });

  it('starts on the chat when nothing is stored, or something that names no tab', async () => {
    expect((await freshStore()).getState().sessionTab).toBe('chat');

    window.localStorage.setItem(KEY, 'map');
    expect((await freshStore()).getState().sessionTab).toBe('chat');
  });

  it('is remembered under the same key when another is opened', async () => {
    const store = await freshStore();

    store.getState().setSessionTab('notes');

    expect(store.getState().sessionTab).toBe('notes');
    expect(window.localStorage.getItem(KEY)).toBe('notes');
  });

  it('still opens when the browser refuses storage', async () => {
    const store = await freshStore();
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('refused'); });
    try {
      store.getState().setSessionTab('initiative');
      expect(store.getState().sessionTab).toBe('initiative');
    } finally {
      refuse.mockRestore();
    }
  });
});

describe('the unread count', () => {
  it('counts only while the chat is not on screen, and opening it reads them', async () => {
    const store = await freshStore();

    store.getState().countUnreadChat();
    expect(store.getState().unreadChat).toBe(0);

    store.getState().setSessionTab('dice');
    store.getState().countUnreadChat();
    store.getState().countUnreadChat();
    expect(store.getState().unreadChat).toBe(2);

    store.getState().setSessionTab('session');
    expect(store.getState().unreadChat).toBe(2);

    store.getState().setSessionTab('chat');
    expect(store.getState().unreadChat).toBe(0);
  });
});

describe('a page that opens a campaign', () => {
  it('starts with no unread messages, on the tab stored now', async () => {
    const store = await freshStore();
    store.getState().setSessionTab('dice');
    store.getState().countUnreadChat();
    // Another window of this browser opened Notes since.
    window.localStorage.setItem(KEY, 'notes');

    store.getState().clearGameState();

    expect(store.getState().unreadChat).toBe(0);
    expect(store.getState().sessionTab).toBe('notes');
  });
});

// On the compact layout the session panels sit in a sheet, closed most of
// the time with the Chat tab still chosen. The chat was then taken as on
// screen, so nothing counted and the bar's Chat badge never lit.
describe('the unread count while the session panels are put away', () => {
  it('counts while they are not shown, even with the chat chosen, and showing them on the chat reads them', async () => {
    const store = await freshStore();
    expect(store.getState().sessionTab).toBe('chat');

    store.getState().setSessionShown(false);
    store.getState().countUnreadChat();
    store.getState().countUnreadChat();
    expect(store.getState().unreadChat).toBe(2);

    store.getState().setSessionShown(true);
    expect(store.getState().unreadChat).toBe(0);
  });

  it('keeps them while they are shown on another panel, until the chat is opened', async () => {
    const store = await freshStore();
    store.getState().setSessionShown(false);
    store.getState().countUnreadChat();

    store.getState().setSessionTab('dice');
    store.getState().setSessionShown(true);
    expect(store.getState().unreadChat).toBe(1);

    store.getState().setSessionTab('chat');
    expect(store.getState().unreadChat).toBe(0);
  });

  it('opening the chat while they are put away reads nothing', async () => {
    const store = await freshStore();
    store.getState().setSessionTab('dice');
    store.getState().setSessionShown(false);
    store.getState().countUnreadChat();

    store.getState().setSessionTab('chat');
    expect(store.getState().unreadChat).toBe(1);
  });

  it('are shown on a page that has just loaded, as the desktop rail is', async () => {
    expect((await freshStore()).getState().sessionShown).toBe(true);
  });
});
