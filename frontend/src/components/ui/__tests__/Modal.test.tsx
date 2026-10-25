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
