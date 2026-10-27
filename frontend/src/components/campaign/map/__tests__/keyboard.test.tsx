/**
 * Which key presses the map's token keys take, and what each one asks for.
 * Keys are read by what they type (`key`), never by where they sit on the
 * keyboard, so `[` is `[` on any layout that can type it.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, createEvent, fireEvent } from '@testing-library/react';
import { keyBelongsToMap, mapKeyAction, createRepeatPacer, ARROW_REPEAT_MS, type KeyPress } from '../keyboard';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/** The key event a press on `target` makes, after anything on the page has had it. */
function pressOn(target: Element, key = 'ArrowUp', used = false): KeyboardEvent {
  const event = createEvent.keyDown(target, { key }) as KeyboardEvent;
  if (used) event.preventDefault();
  fireEvent(target, event);
  return event;
}

afterEach(() => {
  document.body.replaceChildren();
});

/**
 * The map's focus stop and its token menu, on the page. The menu holds what
 * the real one could: buttons, and for the clause that covers typing, a
 * field that takes text.
 */
function mapAndMenu() {
  const map = document.createElement('div');
  map.tabIndex = 0;
  const menu = document.createElement('div');
  document.body.append(map, menu);
  return { map, menu };
}

/** An element of `tag` with these attributes. */
const element = (tag: string, attrs: Record<string, string> = {}, text = '') => () => {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  el.textContent = text;
  return el;
};

// Each "is no" below holds only through its own clause of keyBelongsToMap,
// so taking that clause out fails it.
describe('whether a key belongs to the map', () => {
  it('is yes with the map itself focused', () => {
    const { map, menu } = mapAndMenu();
    map.focus();

    expect(keyBelongsToMap(pressOn(map), map, menu)).toBe(true);
  });

  it('is yes with focus on the menu itself, inside the map\'s own menu', () => {
    const { map, menu } = mapAndMenu();
    menu.tabIndex = -1;
    menu.focus();

    expect(keyBelongsToMap(pressOn(menu), map, menu)).toBe(true);
  });

  it('is no with nothing focused, as after a click on the chat log', () => {
    const { map, menu } = mapAndMenu();

    expect(keyBelongsToMap(pressOn(document.body), map, menu)).toBe(false);
  });

  it('is no with focus on a scrolling panel elsewhere on the page', () => {
    const { map, menu } = mapAndMenu();
    const log = element('div', { tabindex: '0', style: 'overflow-y: auto' })();
    document.body.append(log);
    log.focus();

    expect(keyBelongsToMap(pressOn(log), map, menu)).toBe(false);
  });

  it.each([
    ['a button', element('button', { type: 'button' }, 'Rotate Left')],
    ['a link', element('a', { href: '/somewhere' }, 'Rules')],
    ['a drop-down', element('select')],
    ['a slider', element('input', { type: 'range' })],
    ['a checkbox', element('input', { type: 'checkbox' })],
    ['a tab', element('div', { role: 'tab', tabindex: '0' }, 'Chat')],
    ['a slider made of a div', element('div', { role: 'slider', tabindex: '0' })],
  ])('is no with focus on %s in the menu, which takes the key itself', (_what, make) => {
    const { map, menu } = mapAndMenu();
    const control = make();
    menu.append(control);
    control.focus();

    expect(keyBelongsToMap(pressOn(control), map, menu)).toBe(false);
  });

  it('is no while typing into a field in the menu', () => {
    const { map, menu } = mapAndMenu();
    const note = element('div', { contenteditable: 'true', tabindex: '0' }, 'Notes')();
    menu.append(note);
    note.focus();

    expect(keyBelongsToMap(pressOn(note), map, menu)).toBe(false);
  });

  it('is no once something else on the page has used the key', () => {
    const { map, menu } = mapAndMenu();
    map.focus();

    expect(keyBelongsToMap(pressOn(map, 'ArrowUp', true), map, menu)).toBe(false);
  });

  it('is no while a dialog is open, even with the map still focused', () => {
    function Dialog() {
      const ref = useFocusTrap(true);
      return <div ref={ref} role="dialog" aria-label="Remove token">Sure?</div>;
    }
    const { map, menu } = mapAndMenu();
    map.focus();
    const { unmount } = render(<Dialog />);
    expect(keyBelongsToMap(pressOn(map), map, menu)).toBe(false);

    unmount();
    map.focus();
    expect(keyBelongsToMap(pressOn(map), map, menu)).toBe(true);
  });
});

/** A key press with these modifiers; AltGr is reported as Ctrl and Alt on Windows. */
function key(name: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'altGraph', boolean>> = {}): KeyPress {
  return {
    key: name,
    ctrlKey: mods.ctrlKey ?? false,
    metaKey: mods.metaKey ?? false,
    altKey: mods.altKey ?? false,
    shiftKey: mods.shiftKey ?? false,
    getModifierState: (state: string) => state === 'AltGraph' && (mods.altGraph ?? false),
  };
}

describe('what a key asks the map for', () => {
  it('moves the selected token a square with an arrow, and five with Shift', () => {
    expect(mapKeyAction(key('ArrowUp'))).toEqual({ kind: 'move', key: 'ArrowUp', squares: 1 });
    expect(mapKeyAction(key('ArrowLeft', { shiftKey: true }))).toEqual({ kind: 'move', key: 'ArrowLeft', squares: 5 });
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Alt, which goes back a page in the browser', { altKey: true }],
    ['Cmd, which goes to the start of a line', { metaKey: true }],
  ])('leaves an arrow with %s to the browser', (_what, mods) => {
    expect(mapKeyAction(key('ArrowRight', mods))).toBeNull();
  });

  it('turns the selected token with [ and ]', () => {
    expect(mapKeyAction(key('['))).toEqual({ kind: 'turn', step: -1 });
    expect(mapKeyAction(key(']'))).toEqual({ kind: 'turn', step: 1 });
  });

  it('steps back with , or <, and on with . or >', () => {
    expect(mapKeyAction(key(','))).toEqual({ kind: 'step', direction: -1 });
    expect(mapKeyAction(key('<', { shiftKey: true }))).toEqual({ kind: 'step', direction: -1 });
    expect(mapKeyAction(key('.'))).toEqual({ kind: 'step', direction: 1 });
    expect(mapKeyAction(key('>', { shiftKey: true }))).toEqual({ kind: 'step', direction: 1 });
  });

  it('takes [ and ] typed with AltGr, or with Option on a Mac, as German and French layouts type them', () => {
    expect(mapKeyAction(key('[', { ctrlKey: true, altKey: true, altGraph: true }))).toEqual({ kind: 'turn', step: -1 });
    expect(mapKeyAction(key(']', { altKey: true }))).toEqual({ kind: 'turn', step: 1 });
  });

  it.each([
    ['Cmd, which goes back a page in Chrome and Safari on a Mac', { metaKey: true }],
    ['Ctrl', { ctrlKey: true }],
  ])('leaves [ and ] with %s to the browser', (_what, mods) => {
    expect(mapKeyAction(key('[', mods))).toBeNull();
    expect(mapKeyAction(key(']', mods))).toBeNull();
  });

  it('opens the menu with Enter alone', () => {
    expect(mapKeyAction(key('Enter'))).toEqual({ kind: 'menu' });
    expect(mapKeyAction(key('Enter', { ctrlKey: true }))).toBeNull();
    expect(mapKeyAction(key('Enter', { shiftKey: true }))).toBeNull();
  });

  it('shows the shortcuts with ?, however the layout types it', () => {
    // Shift+/ on a US keyboard, Shift+, on a French one: either way the key is ?.
    expect(mapKeyAction(key('?', { shiftKey: true }))).toEqual({ kind: 'shortcuts' });
    expect(mapKeyAction(key('?', { shiftKey: true, metaKey: true }))).toBeNull();
  });

  it('asks for nothing on any other key', () => {
    expect(mapKeyAction(key('a'))).toBeNull();
    expect(mapKeyAction(key('Tab'))).toBeNull();
    expect(mapKeyAction(key('Escape'))).toBeNull();
  });
});

describe('the pace of a held arrow key', () => {
  it('lets every fresh press through', () => {
    const pacer = createRepeatPacer(ARROW_REPEAT_MS);
    expect(pacer.allow(false, 0)).toBe(true);
    expect(pacer.allow(false, 10)).toBe(true);
    expect(pacer.allow(false, 20)).toBe(true);
  });

  it(`lets a repeat through only ${ARROW_REPEAT_MS} ms after the last move`, () => {
    const pacer = createRepeatPacer(ARROW_REPEAT_MS);
    pacer.allow(false, 1000);
    expect(pacer.allow(true, 1000 + ARROW_REPEAT_MS - 1)).toBe(false);
    expect(pacer.allow(true, 1000 + ARROW_REPEAT_MS)).toBe(true);
    expect(pacer.allow(true, 1000 + ARROW_REPEAT_MS + 60)).toBe(false);
  });
});
