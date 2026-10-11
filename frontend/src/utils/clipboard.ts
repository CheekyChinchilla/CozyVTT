/**
 * Copying text to the clipboard, and saying whether it worked.
 *
 * The browser offers `navigator.clipboard` only to a secure page (HTTPS, or
 * localhost), and CozyVTT also runs over plain HTTP on a home network, where
 * it is undefined. There the older way still works in current browsers:
 * select the text in a hidden box and ask for a copy. A caller tells the
 * user when neither worked, so nobody believes a code was saved when it was
 * not.
 */

/** Copy `text`; true when it reached the clipboard. */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Refused (no permission, or the page lost focus): try the older way.
    }
  }
  return copyBySelection(text);
}

/** The pre-Clipboard-API copy: select the text in an off-screen box and copy the selection. */
function copyBySelection(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  const box = document.createElement('textarea');
  box.value = text;
  box.setAttribute('readonly', '');
  box.style.position = 'fixed';
  box.style.top = '0';
  box.style.left = '-9999px';
  box.style.opacity = '0';
  document.body.appendChild(box);
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  try {
    box.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    box.remove();
    previousFocus?.focus();
  }
}
