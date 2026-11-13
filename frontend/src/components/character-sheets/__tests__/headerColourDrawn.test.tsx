/**
 * The header colour a player picks is drawn where the sheet uses it.
 *
 * The active tab and the Horror d100 header's middle stop and bottom
 * border were classes joined to the colour's name at runtime, such as
 * `border-${accent}`. Tailwind generates only class names written out in
 * full, so for most colours they drew nothing. The tab's underline is now the
 * colour itself and its label the theme's text colour, readable on a dark
 * theme's sheet; the Horror d100 header's classes are written out.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FifthEditionCharacterView } from '../fifth-edition/FifthEditionCharacterView';
import { FifthEditionCharacterEditor } from '../fifth-edition/FifthEditionCharacterEditor';
import { FantasyD20CharacterEditor } from '../fantasy-d20/FantasyD20CharacterEditor';
import { fifthEditionCharacter } from '../fifth-edition/__tests__/fifthEditionFixture';
import { fantasyD20Character } from '../fantasy-d20/__tests__/fantasyD20Fixture';
import { COLOR_PRESETS as HORROR_D100_PRESETS } from '../horror-d100/colorPresets';
import { HorrorD100CharacterView } from '../horror-d100/HorrorD100CharacterView';
import { HorrorD100CharacterEditor } from '../horror-d100/HorrorD100CharacterEditor';
import { blankSkills, horrorD100Character } from '../horror-d100/__tests__/sheetFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const activeTab = () => screen.getByRole('tab', { name: /Stats & Skills/ });
const noop = () => Promise.resolve();

describe('the active tab', () => {
  it.each([
    ['the 5E sheet', () => render(<FifthEditionCharacterView character={fifthEditionCharacter({ themeColor: 'Royal Blue' })} />)],
    ['the 5E editor', () => render(<FifthEditionCharacterEditor character={fifthEditionCharacter({ themeColor: 'Royal Blue' })} onSave={noop} onCancel={vi.fn()} />)],
    ['the Fantasy d20 editor', () => render(<FantasyD20CharacterEditor character={fantasyD20Character({ themeColor: 'Royal Blue' })} onSave={noop} onCancel={vi.fn()} />)],
  ])('on %s is underlined in the header colour', (_name, show) => {
    show();
    expect(activeTab()).toHaveStyle({ borderBottomColor: '#1d4ed8' });
    expect(activeTab()).toHaveClass('text-ink');
  });

  it('is underlined in a custom colour', () => {
    render(<FifthEditionCharacterView character={fifthEditionCharacter({ themeColor: '#123456' })} />);
    expect(activeTab()).toHaveStyle({ borderBottomColor: '#123456' });
  });
});

// jsdom keeps any class name, generated or not, so the presets are checked
// for whole class names; the theme token test refuses a class joined at
// runtime anywhere.
describe('the Horror d100 header colours', () => {
  it.each(HORROR_D100_PRESETS.map((preset) => [preset.name, preset] as const))('%s has whole class names', (_name, preset) => {
    expect(preset.via).toMatch(/^via-[a-z]+-\d{2,3}$/);
    expect(preset.border).toMatch(/^border-[a-z]+-\d{2,3}$/);
  });
});

describe('the Horror d100 sheet', () => {
  const ticked = (themeColor: string) => {
    render(<HorrorD100CharacterView character={horrorD100Character({ themeColor, skills: blankSkills({ appraise: { value: 15, experienceCheck: true } }) })} />);
    screen.getAllByRole('tab', { name: /^Skills$/ }).forEach((tab) => fireEvent.click(tab));
    return screen.getAllByRole('img', { name: 'Experience check ticked' })[0];
  };

  it('underlines the open tab in a custom colour', () => {
    render(<HorrorD100CharacterView character={horrorD100Character({ themeColor: '#123456' })} />);
    expect(screen.getByRole('tab', { name: /^Overview$/ })).toHaveStyle({ borderBottomColor: '#123456' });
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
    ['5E', () => render(<FifthEditionCharacterEditor character={fifthEditionCharacter()} onSave={noop} onCancel={vi.fn()} />)],
    ['Fantasy d20', () => render(<FantasyD20CharacterEditor character={fantasyD20Character()} onSave={noop} onCancel={vi.fn()} />)],
    ['Horror d100', () => render(<HorrorD100CharacterEditor character={horrorD100Character()} onSave={noop} onCancel={vi.fn()} />)],
  ])('on %s does not take the theme accent', (_name, show) => {
    show();
    const save = screen.getByRole('button', { name: /^Save$/ });
    expect(save).not.toHaveClass('btn-primary');
    expect(save).toHaveClass('bg-white', 'text-black');
  });
});

// The Horror d100 editor's header text and boxes were always white, so on
// a pale custom colour the character's name could not be read.
describe('the Horror d100 editor header on a pale colour', () => {
  it('draws its text and boxes dark', () => {
    render(<HorrorD100CharacterEditor character={horrorD100Character({ themeColor: '#ffffff' })} onSave={noop} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('Character name')).toHaveClass('text-black');
    expect(screen.getByLabelText('Profession')).toHaveClass('text-black');
    expect(screen.getByLabelText('Profession')).not.toHaveClass('text-white');
  });
});
