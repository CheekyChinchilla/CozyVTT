/**
 * Managing saved dice rolls.
 *
 * Two things are pinned here.
 *
 * **The server decides what is a valid expression.** The client cannot tell a
 * rollable expression from one that only looks like dice — its own helpers are
 * character-set checks that accept `2d6+` and `dddd`. So a refusal has to be
 * shown as the server worded it, not swallowed or replaced with something
 * vaguer, or someone saves a button that fails every time they press it.
 *
 * **Order is the order of the buttons.** These are aimed at without looking, so
 * editing one must leave it exactly where it was.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DiceMacroManager from '../DiceMacroManager';
import type { DiceMacro } from '@/types';

vi.mock('@/services/api', () => {
  const client = {
    listDiceMacros: vi.fn(),
    createDiceMacro: vi.fn(),
    updateDiceMacro: vi.fn(),
    deleteDiceMacro: vi.fn(),
  };
  return { api: client, default: client };
});

import api from '@/services/api';

const listDiceMacros = api.listDiceMacros as ReturnType<typeof vi.fn>;
const createDiceMacro = api.createDiceMacro as ReturnType<typeof vi.fn>;
const updateDiceMacro = api.updateDiceMacro as ReturnType<typeof vi.fn>;
const deleteDiceMacro = api.deleteDiceMacro as ReturnType<typeof vi.fn>;

const macro = (id: string, name: string, expression: string): DiceMacro => ({
  id,
  userId: 'u1',
  campaignId: 'camp-1',
  name,
  expression,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

/** An axios-shaped rejection, which is what apiErrorMessage reads. */
const serverRefusal = (message: string) => ({
  isAxiosError: true,
  response: { data: { error: 'Validation Error', message } },
});

function renderManager(props: Partial<React.ComponentProps<typeof DiceMacroManager>> = {}) {
  const onMacrosChanged = vi.fn();
  const utils = render(
    <DiceMacroManager
      isOpen
      onClose={vi.fn()}
      campaignId="camp-1"
      onMacrosChanged={onMacrosChanged}
      {...props}
    />
  );
  return { ...utils, onMacrosChanged };
}

beforeEach(() => {
  vi.clearAllMocks();
  listDiceMacros.mockResolvedValue({ macros: [] });
});

describe('DiceMacroManager', () => {
  it('lists what you have already saved', async () => {
    listDiceMacros.mockResolvedValue({
      macros: [macro('m1', 'Stat roll', '4d6kh3'), macro('m2', 'Table rule', '2d6+3')],
    });

    renderManager();

    expect(await screen.findByText('Stat roll')).toBeInTheDocument();
    expect(screen.getByText('4d6kh3')).toBeInTheDocument();
    expect(screen.getByText('Table rule')).toBeInTheDocument();
  });

  it('says so plainly when nothing is saved yet', async () => {
    renderManager();
    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument();
  });

  it('pre-fills the expression from the dice panel, so it is not retyped', async () => {
    // The whole point of opening this from the panel: you have just typed the
    // thing three times.
    renderManager({ initialExpression: '2d6+3' });

    await waitFor(() => expect(listDiceMacros).toHaveBeenCalled());
    expect(screen.getByLabelText('Macro expression')).toHaveValue('2d6+3');
  });

  it('saves a new macro and tells the panel', async () => {
    const created = macro('m9', 'Wild magic', '1d100');
    createDiceMacro.mockResolvedValue({ macro: created });

    const { onMacrosChanged } = renderManager();
    await waitFor(() => expect(listDiceMacros).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('Macro name'), { target: { value: 'Wild magic' } });
    fireEvent.change(screen.getByLabelText('Macro expression'), { target: { value: '1d100' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() =>
      expect(createDiceMacro).toHaveBeenCalledWith('camp-1', { name: 'Wild magic', expression: '1d100' })
    );
    // The panel behind must learn about it, or the button will not appear until
    // the page is reloaded.
    await waitFor(() => expect(onMacrosChanged).toHaveBeenCalledWith([created]));
  });

  it('will not submit without both a name and an expression', async () => {
    renderManager();
    await waitFor(() => expect(listDiceMacros).toHaveBeenCalled());

    const add = screen.getByRole('button', { name: /add/i });
    expect(add).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Macro name'), { target: { value: 'Nameless' } });
    expect(add).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Macro expression'), { target: { value: '1d20' } });
    expect(add).toBeEnabled();
  });

  describe('when the server refuses an expression', () => {
    it('shows the reason it gave, rather than a vaguer one of its own', async () => {
      createDiceMacro.mockRejectedValue(serverRefusal('Too many dice. Maximum 100 per expression.'));

      renderManager();
      await waitFor(() => expect(listDiceMacros).toHaveBeenCalled());

      fireEvent.change(screen.getByLabelText('Macro name'), { target: { value: 'Greedy' } });
      fireEvent.change(screen.getByLabelText('Macro expression'), { target: { value: '101d20' } });
      fireEvent.click(screen.getByRole('button', { name: /add/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/maximum 100 per expression/i);
    });

    it('keeps what was typed so it can be corrected', async () => {
      createDiceMacro.mockRejectedValue(serverRefusal('Invalid expression'));

      renderManager();
      await waitFor(() => expect(listDiceMacros).toHaveBeenCalled());

      fireEvent.change(screen.getByLabelText('Macro name'), { target: { value: 'Typo' } });
      fireEvent.change(screen.getByLabelText('Macro expression'), { target: { value: '2d6+' } });
      fireEvent.click(screen.getByRole('button', { name: /add/i }));

      await screen.findByRole('alert');
      expect(screen.getByLabelText('Macro expression')).toHaveValue('2d6+');
      expect(screen.getByLabelText('Macro name')).toHaveValue('Typo');
    });
  });

  describe('editing', () => {
    beforeEach(() => {
      listDiceMacros.mockResolvedValue({
        macros: [macro('m1', 'First', '1d20'), macro('m2', 'Second', '2d6'), macro('m3', 'Third', '3d8')],
      });
    });

    it('leaves an edited macro exactly where it was', async () => {
      updateDiceMacro.mockResolvedValue({ macro: macro('m1', 'First edited', '1d20') });

      const { onMacrosChanged } = renderManager();
      expect(await screen.findByText('First')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Edit First'));
      fireEvent.change(screen.getByLabelText('Name for First'), { target: { value: 'First edited' } });
      fireEvent.click(screen.getByLabelText('Save changes to First'));

      await waitFor(() => expect(updateDiceMacro).toHaveBeenCalled());
      // Position is the contract — these are buttons people aim at blind.
      await waitFor(() =>
        expect(onMacrosChanged).toHaveBeenLastCalledWith([
          expect.objectContaining({ id: 'm1', name: 'First edited' }),
          expect.objectContaining({ id: 'm2' }),
          expect.objectContaining({ id: 'm3' }),
        ])
      );
    });

    it('can be cancelled without saving', async () => {
      renderManager();
      expect(await screen.findByText('Second')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Edit Second'));
      fireEvent.change(screen.getByLabelText('Name for Second'), { target: { value: 'Discarded' } });
      fireEvent.click(screen.getByLabelText('Cancel editing'));

      expect(updateDiceMacro).not.toHaveBeenCalled();
      expect(screen.getByText('Second')).toBeInTheDocument();
    });

    it('refuses to store an edit the server rejects, and says why', async () => {
      updateDiceMacro.mockRejectedValue(serverRefusal('Invalid expression'));

      renderManager();
      expect(await screen.findByText('First')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Edit First'));
      fireEvent.change(screen.getByLabelText('Expression for First'), { target: { value: '2d6+' } });
      fireEvent.click(screen.getByLabelText('Save changes to First'));

      expect(await screen.findByRole('alert')).toHaveTextContent(/invalid expression/i);
    });
  });

  describe('deleting', () => {
    beforeEach(() => {
      listDiceMacros.mockResolvedValue({ macros: [macro('m1', 'Doomed', '1d20')] });
    });

    it('asks before deleting', async () => {
      renderManager();
      expect(await screen.findByText('Doomed')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Delete Doomed'));

      expect(await screen.findByText(/delete saved roll/i)).toBeInTheDocument();
      expect(deleteDiceMacro).not.toHaveBeenCalled();
    });

    it('deletes once confirmed and tells the panel', async () => {
      deleteDiceMacro.mockResolvedValue({ message: 'Macro deleted' });

      const { onMacrosChanged } = renderManager();
      expect(await screen.findByText('Doomed')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Delete Doomed'));
      fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));

      await waitFor(() => expect(deleteDiceMacro).toHaveBeenCalledWith('camp-1', 'm1'));
      await waitFor(() => expect(onMacrosChanged).toHaveBeenLastCalledWith([]));
    });
  });

  it('reports a failure to load rather than showing an empty list as if it were true', async () => {
    listDiceMacros.mockRejectedValue(serverRefusal('nope'));
    renderManager();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
