/**
 * The header colour a player picks is drawn where the sheet uses it.
 *
 * The active tab and the Call of Cthulhu header's middle stop and bottom
 * border were classes joined to the colour's name at runtime, such as
 * `border-${accent}`. Tailwind generates only class names written out in
 * full, so for most colours they drew nothing. The tab's underline is now the
 * colour itself and its label the theme's text colour, readable on a dark
 * theme's sheet; the Call of Cthulhu header's classes are written out.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DnD5eCharacterView } from '../dnd5e/DnD5eCharacterView';
import { DnD5eCharacterEditor } from '../dnd5e/DnD5eCharacterEditor';
import { Pathfinder2eCharacterEditor } from '../pathfinder2e/Pathfinder2eCharacterEditor';
import { dnd5eCharacter } from '../dnd5e/__tests__/dnd5eFixture';
import { pf2eCharacter } from '../pathfinder2e/__tests__/pf2eFixture';
import { COLOR_PRESETS as COC_PRESETS } from '../call-of-cthulhu-7e/colorPresets';
import { CallOfCthulhu7eCharacterView } from '../call-of-cthulhu-7e/CallOfCthulhu7eCharacterView';
import { CallOfCthulhu7eCharacterEditor } from '../call-of-cthulhu-7e/CallOfCthulhu7eCharacterEditor';
import { COC_BLANK_SHEET, cocCharacter } from '../call-of-cthulhu-7e/__tests__/cocFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const activeTab = () => screen.getByRole('button', { name: /Stats & Skills/ });
const noop = () => Promise.resolve();

describe('the active tab', () => {
  it.each([
    ['the D&D 5e sheet', () => render(<DnD5eCharacterView character={dnd5eCharacter({ themeColor: 'Royal Blue' })} />)],
    ['the D&D 5e editor', () => render(<DnD5eCharacterEditor character={dnd5eCharacter({ themeColor: 'Royal Blue' })} onSave={noop} onCancel={vi.fn()} />)],
    ['the Pathfinder 2e editor', () => render(<Pathfinder2eCharacterEditor character={pf2eCharacter({ themeColor: 'Pathfinder Blue' })} onSave={noop} onCancel={vi.fn()} />)],
  ])('on %s is underlined in the header colour', (_name, show) => {
    show();
    expect(activeTab()).toHaveStyle({ borderBottomColor: '#1d4ed8' });
    expect(activeTab()).toHaveClass('text-ink');
  });

  it('is underlined in a custom colour', () => {
    render(<DnD5eCharacterView character={dnd5eCharacter({ themeColor: '#123456' })} />);
    expect(activeTab()).toHaveStyle({ borderBottomColor: '#123456' });
  });
});

// jsdom keeps any class name, generated or not, so the presets are checked
// for whole class names; the theme token test refuses a class joined at
// runtime anywhere.
describe('the Call of Cthulhu header colours', () => {
  it.each(COC_PRESETS.map((preset) => [preset.name, preset] as const))('%s has whole class names', (_name, preset) => {
    expect(preset.via).toMatch(/^via-[a-z]+-\d{2,3}$/);
    expect(preset.border).toMatch(/^border-[a-z]+-\d{2,3}$/);
  });
});

describe('the Call of Cthulhu sheet', () => {
  const ticked = (themeColor: string) => {
    const skills = COC_BLANK_SHEET.skills as Record<string, Record<string, unknown>>;
    render(<CallOfCthulhu7eCharacterView character={cocCharacter({ themeColor, skills: { ...skills, accounting: { ...skills.accounting, improvementChecked: true } } })} />);
    screen.getAllByRole('button', { name: /^Skills$/ }).forEach((tab) => fireEvent.click(tab));
    return screen.getAllByRole('img', { name: 'Marked for improvement' })[0];
  };

  it('underlines the open tab in a custom colour', () => {
    render(<CallOfCthulhu7eCharacterView character={cocCharacter({ themeColor: '#123456' })} />);
    expect(screen.getByRole('button', { name: /^Overview$/ })).toHaveStyle({ borderBottomColor: '#123456' });
  });

  it('ticks a skill in a custom colour, with a tick that reads on it', () => {
    const mark = ticked('#ffeecc');
    expect(mark).toHaveStyle({ backgroundColor: '#ffeecc' });
    expect(mark.querySelector('svg')).toHaveClass('text-black');
  });

  it('ticks a skill in a preset colour with a white tick on a dark one', () => {
    const mark = ticked('Dark Forest');
    expect(mark).toHaveStyle({ backgroundColor: '#14532d' });
    expect(mark.querySelector('svg')).toHaveClass('text-white');
  });
});

// The header is the player's colour, not the theme's, so its Save button is
// drawn in fixed colours: in the theme's accent it could match the header.
describe('the header Save button', () => {
  it.each([
    ['D&D 5e', () => render(<DnD5eCharacterEditor character={dnd5eCharacter()} onSave={noop} onCancel={vi.fn()} />)],
    ['Pathfinder 2e', () => render(<Pathfinder2eCharacterEditor character={pf2eCharacter()} onSave={noop} onCancel={vi.fn()} />)],
    ['Call of Cthulhu', () => render(<CallOfCthulhu7eCharacterEditor character={cocCharacter()} onSave={noop} onCancel={vi.fn()} />)],
  ])('on %s does not take the theme accent', (_name, show) => {
    show();
    const save = screen.getByRole('button', { name: /^Save$/ });
    expect(save).not.toHaveClass('btn-primary');
    expect(save).toHaveClass('bg-white', 'text-black');
  });
});
