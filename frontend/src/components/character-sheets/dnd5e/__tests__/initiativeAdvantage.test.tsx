/**
 * Advantage on initiative, on the D&D 5e sheet.
 *
 * The editor's box on the Combat tab saves it, and the read-only sheet says
 * so under Initiative. Advantage and disadvantage together cancel to one d20,
 * so a level of exhaustion or the poisoned condition on the sheet cancels it,
 * and the read-only sheet says that instead.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import { DnD5eCharacterView } from '../DnD5eCharacterView';
import { dnd5eCharacter } from './dnd5eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

function openEditor(overrides: Record<string, unknown> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<DnD5eCharacterEditor character={dnd5eCharacter(overrides)} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: /Combat/ }));
  return onSave;
}

async function saved(onSave: ReturnType<typeof vi.fn>): Promise<Record<string, unknown>> {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return onSave.mock.calls[0][0] as Record<string, unknown>;
}

function openView(overrides: Record<string, unknown> = {}) {
  render(<DnD5eCharacterView character={dnd5eCharacter(overrides)} />);
  fireEvent.click(screen.getByRole('tab', { name: /Combat/ }));
}

describe('the D&D 5e editor', () => {
  it('offers the box unticked on a sheet without it', () => {
    openEditor();
    expect(screen.getByRole('checkbox', { name: 'Advantage on initiative' })).not.toBeChecked();
  });

  it('saves the box once it is ticked', async () => {
    const onSave = openEditor();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Advantage on initiative' }));
    expect((await saved(onSave)).initiativeAdvantage).toBe(true);
  });

  it('saves the box unticked again', async () => {
    const onSave = openEditor({ initiativeAdvantage: true });
    const box = screen.getByRole('checkbox', { name: 'Advantage on initiative' });
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect((await saved(onSave)).initiativeAdvantage).toBe(false);
  });

  it('adds nothing to a sheet stored before the box existed', async () => {
    const onSave = openEditor();
    expect('initiativeAdvantage' in (await saved(onSave))).toBe(false);
  });
});

describe('the D&D 5e read-only sheet', () => {
  it('says initiative is rolled with advantage', () => {
    openView({ initiativeAdvantage: true });
    expect(screen.getByText('With advantage')).toBeInTheDocument();
  });

  it.each([
    ['without the box', {}],
    ['with the box unticked', { initiativeAdvantage: false }],
  ])('says nothing of it %s', (_label, overrides) => {
    openView(overrides);
    expect(screen.queryByText('With advantage')).not.toBeInTheDocument();
    expect(screen.queryByText('Advantage cancelled')).not.toBeInTheDocument();
  });

  it.each([
    ['a level of exhaustion', { exhaustionLevel: 2 }],
    ['the poisoned condition', { conditions: ['poisoned'] }],
    ['exhaustion recorded as a condition before it had levels', { conditions: ['exhausted'] }],
  ])('says the advantage is cancelled by %s', (_label, overrides) => {
    openView({ initiativeAdvantage: true, ...overrides });
    expect(screen.getByText('Advantage cancelled')).toBeInTheDocument();
    expect(screen.queryByText('With advantage')).not.toBeInTheDocument();
  });
});
