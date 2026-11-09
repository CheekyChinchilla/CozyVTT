/**
 * A click beside a window never closes it: typed input in a form survives a
 * stray click. Escape and the X close it, unless closing is disabled.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '../Modal';

function renderModal(onClose = vi.fn(), closeDisabled = false) {
  render(
    <Modal open onClose={onClose} title="Invite Player" closeDisabled={closeDisabled}>
      <input aria-label="Name" />
    </Modal>
  );
  return onClose;
}

describe('Modal', () => {
  it('stays open on a click beside the window', () => {
    const onClose = renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Invite Player' });
    const beside = dialog.parentElement as HTMLElement;
    const backdrop = beside.previousElementSibling as HTMLElement;

    fireEvent.click(beside);
    fireEvent.click(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape and on the X', () => {
    const onClose = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not close while closing is disabled', () => {
    const onClose = renderModal(vi.fn(), true);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});

/**
 * A window fits a phone. Its 16 px margin and 24 px of padding left a 360 px
 * phone about 280 px for what it holds; below `sm` they are 8 and 16 px, and
 * from `sm` up as before. Its height follows what the browser shows (`dvh`),
 * so a phone's toolbar never covers its foot, and its buttons go onto a
 * second line where they do not fit on one. On a touch screen its X is
 * 44 px. jsdom evaluates no media query, so the classes are what is checked.
 */
describe('Modal on a phone', () => {
  const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

  function show(props: Partial<Parameters<typeof Modal>[0]> = {}) {
    render(
      <Modal open onClose={vi.fn()} title="Invite Player" footer={<button type="button">Send</button>} {...props}>
        <input aria-label="Name" />
      </Modal>
    );
    const dialog = screen.getByRole('dialog', { name: 'Invite Player' });
    return { dialog, margin: dialog.parentElement, footer: screen.getByRole('button', { name: 'Send' }).parentElement };
  }

  it('keeps 8 px from the screen edge on a phone and 16 px from sm up', () => {
    const { margin } = show();
    expect(classes(margin)).toEqual(expect.arrayContaining(['p-2', 'sm:p-4']));
    expect(classes(margin)).not.toContain('p-4');
  });

  it('pads 16 px on a phone and 24 px from sm up', () => {
    const { dialog } = show();
    expect(classes(dialog)).toEqual(expect.arrayContaining(['p-4', 'sm:p-6']));
    expect(classes(dialog)).not.toContain('p-6');
  });

  it('takes its height from what the browser shows', () => {
    const { dialog } = show();
    expect(classes(dialog)).toContain('max-h-[90dvh]');
    expect(classes(dialog).filter((c) => /vh\]$/.test(c) && !c.includes('dvh'))).toEqual([]);
  });

  it('takes its height from what the browser shows when pinned to the screen', () => {
    const { dialog } = show({ fitViewport: true });
    expect(classes(dialog)).toContain('h-[90dvh]');
    expect(classes(dialog).filter((c) => /vh\]$/.test(c) && !c.includes('dvh'))).toEqual([]);
  });

  it('wraps its buttons on a phone and keeps them on one line from sm up', () => {
    const { footer } = show();
    expect(classes(footer)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'sm:flex-nowrap', 'justify-end']));
  });

  it('gives its X 44 px on a touch screen, with the X centred in it', () => {
    show();
    const close = screen.getByRole('button', { name: 'Close dialog' });
    expect(classes(close)).toEqual(expect.arrayContaining(['touch-target', 'pointer-coarse:[&>svg]:mx-auto', 'p-2']));
  });
});
