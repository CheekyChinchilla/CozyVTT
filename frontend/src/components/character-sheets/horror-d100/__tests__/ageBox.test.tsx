/**
 * The Age box on the Horror d100 editor's header.
 *
 * The schema stores an age as text, turning a typed number into a string, and
 * also accepts text that is not a number from a template or the API. The box
 * is a number input, which cannot show such text, so the text is shown under
 * the box and kept until a number is typed in it.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HorrorD100CharacterEditor } from '../HorrorD100CharacterEditor';
import type { CharacterData } from '../../../../types';
import { horrorD100Character } from './sheetFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

function renderEditor(age: string | number | undefined) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<HorrorD100CharacterEditor character={horrorD100Character({ age })} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
}

function ageBox(age: string | number | undefined): HTMLInputElement {
  renderEditor(age);
  return screen.getByPlaceholderText('Age') as HTMLInputElement;
}

async function savedAge(onSave: ReturnType<typeof renderEditor>): Promise<unknown> {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return (onSave.mock.calls[0][0] as { age?: unknown }).age;
}

describe('the Horror d100 Age box', () => {
  it('shows a stored age', () => {
    expect(ageBox('34').value).toBe('34');
  });

  it('shows 0 for a sheet with no age', () => {
    expect(ageBox(undefined).value).toBe('0');
  });

  it('stays blank for a stored empty age', () => {
    expect(ageBox('').value).toBe('');
  });

  it('keeps a stored empty age when the box is passed through', async () => {
    const onSave = renderEditor('');
    const box = screen.getByPlaceholderText('Age');
    fireEvent.focus(box);
    fireEvent.blur(box);
    expect(box).toHaveValue(null);
    expect(await savedAge(onSave)).toBe('');
  });

  it('shows stored text that is not a number under the box', () => {
    renderEditor('mid-thirties');
    expect(screen.getByPlaceholderText('Age')).toHaveValue(null);
    expect(screen.getByText('mid-thirties')).toBeInTheDocument();
    expect(screen.getByText(/Age saved as text:/)).toHaveTextContent('Age saved as text: mid-thirties. Type a number to replace it.');
  });

  it('keeps the text when the box is passed through', async () => {
    const onSave = renderEditor('mid-thirties');
    const box = screen.getByPlaceholderText('Age');
    fireEvent.focus(box);
    fireEvent.blur(box);
    expect(await savedAge(onSave)).toBe('mid-thirties');
    expect(screen.getByText('mid-thirties')).toBeInTheDocument();
  });

  it('replaces the text with a number typed in the box', async () => {
    const onSave = renderEditor('mid-thirties');
    const box = screen.getByPlaceholderText('Age');
    fireEvent.change(box, { target: { value: '34' } });
    fireEvent.blur(box);
    expect(screen.queryByText('mid-thirties')).not.toBeInTheDocument();
    expect(box).toHaveValue(34);
    expect(await savedAge(onSave)).toBe(34);
  });
});
