/**
 * The D&D 5e Spells tab draws any sheet the server holds, and the editor
 * keeps spell slots to what the server stores.
 *
 * A spellcasting block with an ability but no spells or slots threw on the
 * Spells tab. A slot total of millions drew one mark per slot and froze the
 * browser, and more slots used than the total showed a negative number left.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SpellcastingBlock } from '../components/SpellcastingBlock';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import { dnd5eCharacter } from './dnd5eFixture';
import { SPELL_SLOTS_MAX } from '@/constants/sheetLimits';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

type Block = Parameters<typeof SpellcastingBlock>[0]['spellcasting'];
const block = (value: Record<string, unknown>) => value as unknown as Block;

function slots(level1: { total: number; expended: number }) {
  const all = Object.fromEntries(
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((level) => [level, { total: 0, expended: 0 }])
  );
  return { ...all, '1': level1 };
}

describe('the Spells tab', () => {
  it('draws a spellcasting block with an ability and nothing else', () => {
    render(<SpellcastingBlock spellcasting={block({ ability: 'Wisdom', cantrips: [] })} />);
    expect(screen.getByText('Spell Slots')).toBeInTheDocument();
    expect(screen.getByText('Spell List')).toBeInTheDocument();
  });

  it('writes a slot total too large to draw as a count', () => {
    const { container } = render(
      <SpellcastingBlock spellcasting={block({ ability: 'Wisdom', slots: slots({ total: 1000, expended: 1 }), spells: [] })} />
    );
    expect(screen.getByText('999/1000')).toBeInTheDocument();
    expect(container.querySelectorAll('svg').length).toBeLessThan(50);
  });

  it('draws one mark per slot for a real total', () => {
    const { container } = render(
      <SpellcastingBlock spellcasting={block({ ability: 'Wisdom', slots: slots({ total: 4, expended: 1 }), spells: [] })} />
    );
    expect(screen.getByText('3/4')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot]').length).toBe(4);
  });

  it('never shows fewer than none left', () => {
    render(<SpellcastingBlock spellcasting={block({ ability: 'Wisdom', slots: slots({ total: 2, expended: 3 }), spells: [] })} />);
    expect(screen.getByText('0/2')).toBeInTheDocument();
  });
});

describe('spell slots in the editor', () => {
  function openSpells(spellcasting: Record<string, unknown>) {
    render(
      <DnD5eCharacterEditor
        character={dnd5eCharacter({ spellcasting })}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Spells/ }));
  }

  it(`stops each total at ${SPELL_SLOTS_MAX} and each used box at its total`, () => {
    openSpells({ ability: 'Wisdom', slots: slots({ total: 3, expended: 1 }), spells: [] });
    const totals = screen.getAllByLabelText('Total');
    const used = screen.getAllByLabelText('Used');
    expect(totals).toHaveLength(9);
    expect(totals[0]).toHaveAttribute('max', String(SPELL_SLOTS_MAX));
    expect(used[0]).toHaveAttribute('max', '3');
  });

  it('brings a stored total over the limit, and more used than the total, within it', () => {
    openSpells({ ability: 'Wisdom', slots: slots({ total: 5_000_000, expended: 6_000_000 }), spells: [] });
    expect(screen.getAllByLabelText('Total')[0]).toHaveValue(SPELL_SLOTS_MAX);
    expect(screen.getAllByLabelText('Used')[0]).toHaveValue(SPELL_SLOTS_MAX);
  });

  it('saves no more slots used than the total', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <DnD5eCharacterEditor
        character={dnd5eCharacter({ spellcasting: { ability: 'Wisdom', slots: slots({ total: 4, expended: 3 }), spells: [] } })}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Spells/ }));
    const total = screen.getAllByLabelText('Total')[0];
    fireEvent.change(total, { target: { value: '2' } });
    fireEvent.blur(total);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0] as { spellcasting: { slots: Record<string, unknown> } };
    expect(saved.spellcasting.slots['1']).toEqual({ total: 2, expended: 2 });
  });

  it('lowers the used count when the total drops below it', () => {
    openSpells({ ability: 'Wisdom', slots: slots({ total: 4, expended: 3 }), spells: [] });
    const total = screen.getAllByLabelText('Total')[0];
    fireEvent.change(total, { target: { value: '2' } });
    fireEvent.blur(total);
    expect(screen.getAllByLabelText('Used')[0]).toHaveValue(2);
  });
});
