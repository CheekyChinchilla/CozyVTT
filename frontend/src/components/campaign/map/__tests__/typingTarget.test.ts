/**
 * Which focused elements take the keyboard away from the map's shortcuts.
 */

import { describe, it, expect } from 'vitest';
import { isTypingInto } from '../typingTarget';

function el(html: string): HTMLElement {
  const box = document.createElement('div');
  box.innerHTML = html;
  document.body.appendChild(box);
  return box.firstElementChild as HTMLElement;
}

describe('isTypingInto', () => {
  it.each([
    ['a text box', '<input type="text">'],
    ['an input with no type', '<input>'],
    ['a number box', '<input type="number">'],
    ['a search box', '<input type="search">'],
    ['a slider, which takes the arrow keys', '<input type="range">'],
    ['a text area', '<textarea></textarea>'],
    ['a drop-down', '<select><option>a</option></select>'],
    ['editable content', '<div contenteditable="true"></div>'],
  ])('is true for %s', (_label, html) => {
    expect(isTypingInto(el(html))).toBe(true);
  });

  it('is true inside editable content', () => {
    const editor = el('<div contenteditable="true"><p><span>text</span></p></div>');
    expect(isTypingInto(editor.querySelector('span'))).toBe(true);
  });

  it.each([
    ['a button', '<button>Select</button>'],
    ['a checkbox', '<input type="checkbox">'],
    ['a colour picker', '<input type="color">'],
    ['a plain element', '<div></div>'],
    ['content made not editable', '<div contenteditable="false"></div>'],
  ])('is false for %s', (_label, html) => {
    expect(isTypingInto(el(html))).toBe(false);
  });

  it('is false for the page itself and for no target', () => {
    expect(isTypingInto(document.body)).toBe(false);
    expect(isTypingInto(window)).toBe(false);
    expect(isTypingInto(null)).toBe(false);
  });
});
