/**
 * A Horror d100 sheet stored without its characteristics, wholly or in part.
 *
 * The conversion of the sheets stored before 1.7.0 writes an old sheet that
 * held no characteristics as a rebuilt one that holds none. The editor shows
 * each absent one as an empty box, never as 0: losing focus, or saving with
 * nothing typed, invents no value. Save says which are missing and sends
 * nothing until they are typed, and what the rules work out from them is
 * worked out then, as for a new character.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HorrorD100CharacterEditor } from '../HorrorD100CharacterEditor';
import { HorrorD100CharacterView } from '../HorrorD100CharacterView';
import { openedHorrorD100Sheet } from '../sheetForm';
import type { Character, CharacterData } from '../../../../types';
import type { HorrorD100Sheet } from '@/types/game-systems/horrorD100Sheet';
import { horrorD100Character } from './sheetFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const SEVEN = ['STR', 'CON', 'SIZ', 'INT', 'POW', 'DEX', 'CHA'] as const;

/** A character whose stored sheet is exactly `data`. */
const storing = (data: Record<string, unknown>): Character => ({ ...horrorD100Character(), data: data as unknown as CharacterData });

function open(data: Record<string, unknown>) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<HorrorD100CharacterEditor character={storing(data)} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
}

const box = (name: string) => screen.getByRole('spinbutton', { name });
const pressSave = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));
const bare = { characterName: 'Ines Okafor', profession: 'Sailor', era: '1920s' };
const typed = { STR: 12, CON: 13, SIZ: 11, INT: 15, POW: 14, DEX: 16, CHA: 9 };

describe('a sheet stored with no characteristics', () => {
  it('opens with seven empty boxes, no roll under them, and nothing worked out', () => {
    open(bare);
    for (const name of SEVEN) expect(box(name)).toHaveValue(null);
    expect(screen.queryByText('0%')).toBeNull();
    const opened = openedHorrorD100Sheet(bare as HorrorD100Sheet);
    expect(opened.characteristics).toEqual({});
    for (const block of ['hitPoints', 'powerPoints', 'sanity', 'skills']) expect(opened).not.toHaveProperty(block);
  });

  it('is not saved untouched: Save names the missing characteristics and sends nothing', () => {
    const onSave = open(bare);
    pressSave();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Type a value for each characteristic: STR, CON, SIZ, INT, POW, DEX and CHA are missing');
    for (const name of SEVEN) expect(box(name)).toBeInvalid();
  });

  it('gains no value when focus passes through its boxes', () => {
    const onSave = open(bare);
    for (const tab of ['Overview', 'Skills', 'Combat', 'Possessions', 'Story']) {
      fireEvent.click(screen.getByRole('tab', { name: tab }));
      for (const field of document.querySelectorAll<HTMLElement>('input:not([type="file"]):not([type="color"]), textarea, select')) {
        fireEvent.focus(field);
        fireEvent.blur(field);
      }
    }
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    for (const name of SEVEN) expect(box(name)).toHaveValue(null);
    pressSave();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('is saved once the seven are typed, with what the rules work out from them and Sanity starting at five times POW', async () => {
    const onSave = open(bare);
    // POW first, a digit at a time, as a player types it.
    fireEvent.change(box('POW'), { target: { value: '1' } });
    fireEvent.change(box('POW'), { target: { value: '14' } });
    for (const name of SEVEN) fireEvent.change(box(name), { target: { value: String(typed[name]) } });
    pressSave();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0] as HorrorD100Sheet;
    expect(saved.characteristics).toEqual(typed);
    expect(saved.hitPoints).toEqual({ maximum: 12, current: 12 });
    expect(saved.powerPoints).toEqual({ maximum: 14, current: 14 });
    expect(saved.sanity).toEqual({ starting: 70, maximum: 99, current: 70 });
    expect(saved.move).toBe(10);
    expect(saved.skills?.dodge).toEqual({ value: 32, experienceCheck: false });
    expect(saved.skills?.gaming.value).toBe(29);
    expect(saved.skills?.languageOwn.value).toBe(75);
    expect(saved.skills?.climb.value).toBe(40);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows no number for a missing characteristic on the read-only sheet', () => {
    render(<HorrorD100CharacterView character={storing(bare)} />);
    expect(screen.queryByText('STR')).toBeNull();
    expect(screen.queryByText('0%')).toBeNull();
  });
});

describe('a sheet stored with some of its characteristics', () => {
  const partial = { ...bare, characteristics: { STR: 12, CON: 13, SIZ: 11, DEX: 16 }, hitPoints: { maximum: 12, current: 7 } };

  it('shows the stored ones, leaves the rest empty, and names only those in the message', () => {
    const onSave = open(partial);
    expect(box('STR')).toHaveValue(12);
    for (const name of ['INT', 'POW', 'CHA']) expect(box(name)).toHaveValue(null);
    pressSave();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Type a value for each characteristic: INT, POW and CHA are missing');
    expect(box('STR')).toBeValid();
    expect(box('POW')).toBeInvalid();
  });

  it('keeps the stored hit points, and works out only the blocks it lacked once their characteristics are typed', async () => {
    const onSave = open(partial);
    fireEvent.change(box('INT'), { target: { value: '15' } });
    fireEvent.change(box('POW'), { target: { value: '14' } });
    fireEvent.change(box('CHA'), { target: { value: '9' } });
    pressSave();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0] as HorrorD100Sheet;
    expect(saved.hitPoints).toEqual({ maximum: 12, current: 7 });
    expect(saved.powerPoints).toEqual({ maximum: 14, current: 14 });
    expect(saved.sanity).toEqual({ starting: 70, maximum: 99, current: 70 });
    expect(saved.skills?.gaming.value).toBe(29);
  });

  it('names one missing characteristic alone', () => {
    open({ ...bare, characteristics: { ...typed, CHA: undefined } });
    pressSave();
    expect(screen.getByRole('alert')).toHaveTextContent('Type a value for each characteristic: CHA is missing');
  });
});
