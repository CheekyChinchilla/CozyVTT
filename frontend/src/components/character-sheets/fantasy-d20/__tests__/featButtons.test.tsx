/**
 * Every Fantasy d20 "Add Feat" button has its background.
 *
 * The buttons' classes were put together while the page ran
 * (`bg-${color}-700`), and Tailwind only generates a class it finds written
 * out in the source, so the Ancestry & Heritage, Skill and Bonus buttons came
 * out with no background at all: white text on white. They are the shared
 * Button now, whose class is written out in its own source.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import source from '../FantasyD20CharacterEditor.tsx?raw';
import buttonSource from '@/components/ui/Button.tsx?raw';
import { FantasyD20CharacterEditor } from '../FantasyD20CharacterEditor';
import { fantasyD20Character } from './fantasyD20Fixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

describe('the Add Feat buttons', () => {
  it('build no background class while the page runs', () => {
    expect(source).not.toMatch(/bg-\$\{/);
  });

  it('each carry a background class written out in the source', () => {
    render(<FantasyD20CharacterEditor character={fantasyD20Character()} onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Feats & Features/ }));
    const buttons = screen.getAllByRole('button', { name: 'Add Feat' });
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      const background = button.className.split(/\s+/).find((c) => c === 'btn-primary');
      expect(background).toBeDefined();
      expect(buttonSource).toContain(background!);
    }
  });
});
