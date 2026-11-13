/**
 * The Original values panel of a Horror d100 character converted from the
 * sheet used before 1.7.0.
 *
 * It shows the record the conversion wrote: the old characteristics, Luck,
 * hit points, power points, Sanity, damage modifier and MOV, every old skill
 * rating, and whatever found no place on the rebuilt sheet. It is read-only,
 * absent from a sheet with no record, and never saved differently.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { HorrorD100CharacterEditor } from '../HorrorD100CharacterEditor';
import { HorrorD100CharacterView } from '../HorrorD100CharacterView';
import { OriginalValues } from '../components/OriginalValues';
import type { CharacterData } from '../../../../types';
import type { HorrorD100ConversionRecord, HorrorD100Sheet } from '@/types/game-systems/horrorD100Sheet';
import { horrorD100Character } from './sheetFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const record: HorrorD100ConversionRecord = {
  from: 1,
  at: '2026-11-12T08:30:00.000Z',
  characteristics: { STR: 60, CON: 65, SIZ: 55, INT: 75, POW: 70, DEX: 80, CHA: 45, EDU: 85 },
  luck: 35,
  hitPoints: { maximum: 12, current: 7 },
  powerPoints: { maximum: 14, current: 14 },
  sanity: { starting: 70, maximum: 92, current: 58 },
  damageModifier: '+1d4',
  build: 1,
  move: 8,
  skills: [
    { name: 'Charm', value: 45 },
    { name: 'Status', value: 20, experienceCheck: true },
    { name: 'Survival (Sea)', value: 10 },
  ],
  kept: ['Spare box: "kept as written"', 'STR: "sixty"'],
};

const panel = () => screen.getByRole('region', { name: 'Original values' });
/** The value shown under `label` in the panel. */
const figure = (label: string) => within(panel()).getByText(label).parentElement?.textContent;

describe('the Original values panel', () => {
  it('shows every value the record holds', () => {
    render(<OriginalValues record={record} />);
    for (const [key, value] of Object.entries(record.characteristics)) expect(figure(key)).toBe(`${key}${value}`);
    expect(figure('Luck')).toBe('Luck35');
    expect(figure('Hit points')).toBe('Hit points7 of 12');
    expect(figure('Power points')).toBe('Power points14 of 14');
    expect(figure('Sanity')).toBe('Sanity58 of 92');
    expect(figure('Starting Sanity')).toBe('Starting Sanity70');
    expect(figure('Damage modifier')).toBe('Damage modifier+1d4');
    expect(figure('Strength and size step')).toBe('Strength and size step1');
    expect(figure('MOV')).toBe('MOV8');
    expect(within(panel()).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Charm45%', 'Status20%', 'Survival (Sea)10%', 'Spare box: "kept as written"', 'STR: "sixty"',
    ]);
    expect(within(panel()).getByText(/This sheet was rebuilt on Nov 12, 2026/)).toBeInTheDocument();
  });

  it('marks the experience check the rebuilt sheet has no place for', () => {
    render(<OriginalValues record={record} />);
    const ticked = within(panel()).getAllByRole('img', { name: 'Experience check ticked' });
    expect(ticked).toHaveLength(1);
    expect(ticked[0].closest('li')).toHaveTextContent('Status20%');
  });

  it('shows a 0 the record holds, and leaves out what it lacks', () => {
    render(<OriginalValues record={{ from: 1, at: 'before the upgrade', characteristics: { STR: 0 }, luck: 0, hitPoints: { current: 3 }, skills: [], kept: [] }} />);
    expect(figure('STR')).toBe('STR0');
    expect(figure('Luck')).toBe('Luck0');
    expect(figure('Hit points')).toBe('Hit points3');
    expect(within(panel()).queryByText('CON')).toBeNull();
    expect(within(panel()).queryByText('MOV')).toBeNull();
    expect(within(panel()).queryByText('Skills')).toBeNull();
    expect(within(panel()).queryByText('Kept as written')).toBeNull();
    expect(within(panel()).getByText(/This sheet was rebuilt on before the upgrade/)).toBeInTheDocument();
  });

  it('offers nothing to type into or press', () => {
    render(<OriginalValues record={record} />);
    for (const role of ['textbox', 'spinbutton', 'button', 'checkbox']) expect(within(panel()).queryByRole(role)).toBeNull();
  });
});

describe('on the read-only sheet', () => {
  const openStory = (sheet: Partial<HorrorD100Sheet>, showOriginalValues?: boolean) => {
    render(<HorrorD100CharacterView character={horrorD100Character(sheet)} showOriginalValues={showOriginalValues} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Story' }));
  };

  it('is shown where the page says the reader is the owner or the GM', () => {
    openStory({ converted: record }, true);
    expect(figure('Luck')).toBe('Luck35');
  });

  it('is not shown unless the page says so', () => {
    openStory({ converted: record });
    expect(screen.queryByText('Original values')).toBeNull();
  });

  it('is absent from a sheet with no record', () => {
    openStory({}, true);
    expect(screen.queryByText('Original values')).toBeNull();
  });
});

describe('in the editor', () => {
  function openStory(sheet: Partial<HorrorD100Sheet>) {
    const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
    render(<HorrorD100CharacterEditor character={horrorD100Character(sheet)} onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Story' }));
    return onSave;
  }

  it('is shown, read-only, and saved back exactly as it was stored', async () => {
    const onSave = openStory({ converted: record });
    expect(figure('Sanity')).toBe('Sanity58 of 92');
    for (const role of ['textbox', 'spinbutton', 'button', 'checkbox']) expect(within(panel()).queryByRole(role)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add Note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect((onSave.mock.calls[0][0] as HorrorD100Sheet).converted).toEqual(record);
  });

  it('is absent from a sheet with no record, and no record is saved for it', async () => {
    const onSave = openStory({});
    expect(screen.queryByText('Original values')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('converted');
  });
});
