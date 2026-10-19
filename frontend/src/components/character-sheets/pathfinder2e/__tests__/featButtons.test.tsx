/**
 * Every Pathfinder 2e "Add Feat" button has its background.
 *
 * The buttons' classes were put together while the page ran
 * (`bg-${color}-700`), and Tailwind only generates a class it finds written
 * out in the source, so the Ancestry & Heritage, Skill and Bonus buttons came
 * out with no background at all: white text on white. The classes are written
 * out now.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import source from '../Pathfinder2eCharacterEditor.tsx?raw';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import { pf2eCharacter } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

describe('the Add Feat buttons', () => {
  it('build no background class while the page runs', () => {
    expect(source).not.toMatch(/bg-\$\{/);
  });

  it('each carry a background class written out in the source', () => {
    render(<Pathfinder2eCharacterEditor character={pf2eCharacter()} onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Feats & Features/ }));
    const buttons = screen.getAllByRole('button', { name: 'Add Feat' });
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      const background = button.className.split(/\s+/).find((c) => /^bg-[a-z]+-700$/.test(c));
      expect(background).toBeDefined();
      expect(source).toContain(background!);
    }
  });
});
