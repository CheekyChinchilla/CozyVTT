/**
 * The skills block of the rebuilt Horror d100 sheet.
 *
 * It lists the open d100 rules' skills by their six categories: each skill
 * with one rating at its base chance, each skill held once for a specialty
 * as a list the player adds to, renames and removes from, and the
 * character's own skills last. Every value can be set from 0 up, each skill
 * keeps notes, and every skill but Status and Knowledge (Blasphemous Lore)
 * takes an experience check.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { HorrorD100CharacterEditor } from '../HorrorD100CharacterEditor';
import { HorrorD100CharacterView } from '../HorrorD100CharacterView';
import { SkillsList } from '../components/SkillsList';
import { HORROR_D100_SPECIALTIES_OFFERED, horrorD100SpecialtyBase } from '../specialisations';
import type { CharacterData } from '../../../../types';
import type { HorrorD100Sheet, HorrorD100SheetSkills } from '@/types/game-systems/horrorD100Sheet';
import { blankSkills, horrorD100Character } from './sheetFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const rated = (value: number, extra: Record<string, unknown> = {}) => ({ value, experienceCheck: false, ...extra });

function openSkills(skills: Partial<HorrorD100SheetSkills> = {}, sheet: Partial<HorrorD100Sheet> = {}) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<HorrorD100CharacterEditor character={horrorD100Character({ ...sheet, skills: blankSkills(skills) })} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Skills' }));
  return async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return (onSave.mock.calls[0][0] as HorrorD100Sheet).skills!;
  };
}

/** The row of the skill listed as `name`; the legend under the list names some skills too. */
const rowOf = (name: string): HTMLElement => {
  const row = screen.getAllByText(name).map((element) => element.closest<HTMLElement>('.group')).find((found) => found !== null);
  if (!row) throw new Error(`no row for ${name}`);
  return row;
};

/** The category each skill that comes in specialties is listed under. */
const CATEGORY_OF: Record<string, string> = {
  Firearm: 'Combat', 'Melee Weapon': 'Combat', 'Missile Weapon': 'Combat', Language: 'Communication',
  Knowledge: 'Mental', Science: 'Mental', Drive: 'Physical',
};

/** Adds a specialty with its category's add control: one the rules offer, Other, or one to be named. */
const add = (label: string, choice?: string) => {
  if (label === 'Skill') {
    fireEvent.click(screen.getByRole('button', { name: 'Add Skill' }));
    return;
  }
  const category = CATEGORY_OF[label];
  const select = screen.getByLabelText(`${category} skill to add`) as HTMLSelectElement;
  const wanted = choice ? `${label} (${choice})` : label;
  const option = Array.from(select.options).find((found) => found.textContent === wanted || found.textContent?.startsWith(`${wanted}, `));
  if (!option) throw new Error(`${category} offers no ${wanted}`);
  fireEvent.change(select, { target: { value: option.value } });
  fireEvent.click(screen.getByRole('button', { name: `Add ${category} skill` }));
};

describe('the skills listed', () => {
  it('come under the rules\' six categories, then the character\'s own', () => {
    openSkills();
    expect(screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent)).toEqual([
      'Combat', 'Communication', 'Manipulation', 'Mental', 'Perception', 'Physical', 'Own Skills',
    ]);
  });

  it('are each of the rules\' skills with one rating, at its base chance', () => {
    openSkills();
    const shown = (name: string) => [(screen.getByLabelText(`Value of ${name}`) as HTMLInputElement).value, screen.getByLabelText(`Value of ${name}`).closest('.group')!.textContent];
    expect(shown('Appraise')).toEqual(['15', 'Appraise15%']);
    expect(shown('Climb')).toEqual(['40', 'Climb40%']);
    expect(shown('Dodge')).toEqual(['20', 'Dodge20%']);
    expect(shown('Gaming')).toEqual(['20', 'Gaming20%']);
    expect(shown('Status')).toEqual(['15', 'Status15%']);
    expect(shown('Language (Own)')[0]).toBe('50');
    expect(within(screen.getByRole('tabpanel')).getAllByRole('spinbutton')).toHaveLength(34 + 1 + 1);
  });

  it('show a base chance that follows the characteristics, and a value that stays as stored', () => {
    render(<SkillsList skills={blankSkills()} characteristics={{ DEX: 14, INT: 13, POW: 9, EDU: 16 }} />);
    const row = (name: string) => rowOf(name).textContent;
    expect(row('Dodge')).toBe('Dodge28%20%');
    expect(row('Gaming')).toBe('Gaming22%20%');
    expect(row('Language (Own)')).toBe('Language (Own)80%50%');
  });

  it('show no base chance for a skill of the character\'s own, or a weapon the rules give no one base', () => {
    render(<SkillsList skills={blankSkills({ own: [{ name: 'Charm', ...rated(45) }], heavyWeapon: [{ specialty: 'Flamethrower', ...rated(5) }] })} />);
    expect(screen.getByText('Charm').closest('.group')!.textContent).toBe('Charm—45%');
    expect(screen.getByText('Heavy Weapon (Flamethrower)').closest('.group')!.textContent).toBe('Heavy Weapon (Flamethrower)—5%');
  });
});

describe('the specialties offered', () => {
  it('are the rules\' firearms, each at the base its weapons share', () => {
    expect(HORROR_D100_SPECIALTIES_OFFERED.firearm).toEqual([
      { name: 'Handgun', base: 20 }, { name: 'Machine Gun', base: 15 }, { name: 'Pistol', base: 20 }, { name: 'Revolver', base: 20 },
      { name: 'Rifle', base: 25 }, { name: 'Shotgun', base: 30 }, { name: 'Submachine Gun', base: 15 },
    ]);
  });

  it('are the melee weapon classes, the sciences at 1% and the Knowledge specialties at 5%, Blasphemous Lore at 0%', () => {
    expect(HORROR_D100_SPECIALTIES_OFFERED.meleeWeapon?.map((choice) => choice.name)).toEqual([
      'Axe', 'Club', 'Dagger', 'Flail', 'Hammer', 'Hand', 'Mace', 'Polearm', 'Spear', 'Staff', 'Sword',
    ]);
    expect(HORROR_D100_SPECIALTIES_OFFERED.science?.every((choice) => choice.base === 1)).toBe(true);
    expect(HORROR_D100_SPECIALTIES_OFFERED.knowledge?.filter((choice) => choice.base !== 5)).toEqual([{ name: 'Blasphemous Lore', base: 0 }]);
    expect(HORROR_D100_SPECIALTIES_OFFERED.knowledge?.map((choice) => choice.name)).toEqual(expect.arrayContaining(['Accounting', 'History', 'Law', 'Occult', 'Religion']));
  });

  // The Detective profession names Firearm (Handgun) (open d100 rules, p. 22),
  // and the built-in detective holds it: it has a base as any pistol or revolver has.
  it('offer Handgun, and show its base chance on a sheet that holds it', () => {
    expect(horrorD100SpecialtyBase('firearm', 'Handgun')).toBe(20);
    render(<SkillsList skills={blankSkills({ firearm: [{ specialty: 'Handgun', ...rated(55) }] })} />);
    expect(screen.getByText('Firearm (Handgun)').closest('.group')!.textContent).toBe('Firearm (Handgun)20%55%');
  });

  it('give a specialty its own base, or its skill\'s', () => {
    expect(horrorD100SpecialtyBase('firearm', ' shotgun ')).toBe(30);
    expect(horrorD100SpecialtyBase('firearm', 'Flare Gun')).toBeNull();
    expect(horrorD100SpecialtyBase('knowledge', 'Natural History')).toBe(5);
    expect(horrorD100SpecialtyBase('knowledge', 'blasphemous lore')).toBe(0);
    expect(horrorD100SpecialtyBase('languageOther', 'Latin')).toBe(0);
    expect(horrorD100SpecialtyBase('repair', 'Mechanical')).toBe(15);
  });
});

// The editor had an add control under each of the 21 skills that come in
// specialties, between the skill rows: 17 bare lines and four with a list.
describe('the add controls', () => {
  it('are one for each category that has skills to add, and one for the character\'s own', () => {
    openSkills();
    expect(screen.getAllByRole('button', { name: /^Add / }).map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual([
      'Add Combat skill', 'Add Communication skill', 'Add Manipulation skill', 'Add Mental skill', 'Add Physical skill', 'Add Skill',
    ]);
    expect(screen.queryByLabelText('Perception skill to add')).toBeNull();
  });

  it('offer every skill of the category that comes in specialties: the rules\' choices at their base chances, Other, or the skill alone', () => {
    openSkills();
    const offered = (category: string) => Array.from((screen.getByLabelText(`${category} skill to add`) as HTMLSelectElement).options).map((option) => option.textContent);
    expect(offered('Combat')).toEqual([
      'Artillery', 'Energy Weapon',
      'Firearm (Handgun), 20%', 'Firearm (Machine Gun), 15%', 'Firearm (Pistol), 20%', 'Firearm (Revolver), 20%', 'Firearm (Rifle), 25%',
      'Firearm (Shotgun), 30%', 'Firearm (Submachine Gun), 15%', 'Firearm (Other)',
      'Heavy Weapon',
      'Melee Weapon (Axe), 15%', 'Melee Weapon (Club), 25%', 'Melee Weapon (Dagger), 25%', 'Melee Weapon (Flail), 10%', 'Melee Weapon (Hammer), 25%',
      'Melee Weapon (Hand), 25%', 'Melee Weapon (Mace), 25%', 'Melee Weapon (Polearm), 15%', 'Melee Weapon (Spear), 15%', 'Melee Weapon (Staff), 15%',
      'Melee Weapon (Sword), 15%', 'Melee Weapon (Other)',
      'Missile Weapon', 'Parry', 'Shield',
    ]);
    expect(offered('Communication')).toEqual(['Etiquette', 'Language']);
    expect(offered('Manipulation')).toEqual(['Art', 'Craft', 'Heavy Machine', 'Repair']);
    expect(offered('Physical')).toEqual(['Drive', 'Pilot', 'Ride']);
    expect(offered('Mental')).toEqual(expect.arrayContaining(['Knowledge (Occult), 5%', 'Knowledge (Blasphemous Lore), 0%', 'Knowledge (Other)', 'Science (Physics), 1%', 'Science (Other)', 'Technical Skill']));
  });

  it('are each a finger wide on a touch screen', () => {
    openSkills();
    const classes = (element: Element) => (element.getAttribute('class') ?? '').split(/\s+/);
    for (const button of screen.getAllByRole('button', { name: /^Add / })) expect(classes(button)).toContain('touch-target');
    expect(classes(screen.getByLabelText('Combat skill to add'))).toContain('pointer-coarse:min-h-11');
  });

  it('put a new specialty under its own skill, after the ones it already holds', async () => {
    const save = openSkills({ firearm: [{ specialty: 'Rifle', ...rated(25) }] });
    add('Firearm', 'Handgun');
    expect(screen.getByLabelText('Value of Firearm (Handgun)')).toBeInTheDocument();
    expect((await save()).firearm).toEqual([{ specialty: 'Rifle', ...rated(25) }, { specialty: 'Handgun', ...rated(20) }]);
  });
});

describe('adding a specialty', () => {
  it('adds a firearm at its base', async () => {
    const save = openSkills();
    add('Firearm', 'Shotgun');
    expect((await save()).firearm).toEqual([{ specialty: 'Shotgun', value: 30, experienceCheck: false }]);
  });

  it('adds a melee weapon, a science and a Knowledge specialty at their bases', async () => {
    const save = openSkills({ knowledge: [] });
    add('Melee Weapon', 'Sword');
    add('Science', 'Chemistry');
    add('Knowledge', 'Occult');
    add('Knowledge', 'Blasphemous Lore');
    const skills = await save();
    expect(skills.meleeWeapon).toEqual([{ specialty: 'Sword', ...rated(15) }]);
    expect(skills.science).toEqual([{ specialty: 'Chemistry', ...rated(1) }]);
    expect(skills.knowledge).toEqual([{ specialty: 'Occult', ...rated(5) }, { specialty: 'Blasphemous Lore', ...rated(0) }]);
  });

  it('adds one to be named, at the skill\'s base chance, or at 0 where each weapon has its own', async () => {
    const save = openSkills();
    add('Knowledge', 'Other');
    add('Language');
    add('Drive');
    add('Missile Weapon');
    fireEvent.change(screen.getByLabelText('Specialty of Knowledge 2'), { target: { value: 'Tides' } });
    fireEvent.change(screen.getByLabelText('Name of language 1'), { target: { value: 'Latin' } });
    const skills = await save();
    expect(skills.knowledge[1]).toEqual({ specialty: 'Tides', ...rated(5) });
    expect(skills.languageOther).toEqual([{ specialty: 'Latin', ...rated(0) }]);
    expect(skills.drive).toEqual([{ specialty: '', ...rated(20) }]);
    expect(skills.missileWeapon).toEqual([{ specialty: '', ...rated(0) }]);
  });

  it('adds a skill of the character\'s own, which can be named', async () => {
    const save = openSkills();
    add('Skill');
    fireEvent.change(screen.getByLabelText('Name of own skill 1'), { target: { value: 'Seamanship' } });
    fireEvent.change(screen.getByLabelText('Value of Seamanship'), { target: { value: '35' } });
    expect((await save()).own).toEqual([{ name: 'Seamanship', value: 35, experienceCheck: false }]);
  });
});

describe('the rows', () => {
  const held = { science: [{ specialty: 'Botany', ...rated(31) }, { specialty: 'Geology', ...rated(12) }], own: [{ name: 'Charm', ...rated(45) }] };

  it('can be removed', async () => {
    const save = openSkills(held);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Science (Botany)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Charm' }));
    const skills = await save();
    expect(skills.science).toEqual([{ specialty: 'Geology', ...rated(12) }]);
    expect(skills.own).toEqual([]);
  });

  it('have no remove button where the rules list the skill itself', () => {
    openSkills(held);
    expect(screen.queryByRole('button', { name: 'Remove Spot' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove Language (Own)' })).toBeNull();
  });

  it('take a value below their base chance, a tick and the own language\'s name', async () => {
    const save = openSkills(held);
    fireEvent.change(screen.getByLabelText('Value of Climb'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Value of Science (Geology)'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Experience check for Science (Geology)' }));
    fireEvent.change(screen.getByLabelText('Own language'), { target: { value: 'Portuguese' } });
    const skills = await save();
    expect(skills.climb).toEqual(rated(0));
    expect(skills.science[1]).toEqual({ specialty: 'Geology', value: 2, experienceCheck: true });
    expect(skills.languageOwn).toEqual({ language: 'Portuguese', value: 50, experienceCheck: false });
  });

  it('number the controls of rows of the same name, so each can be told apart', () => {
    openSkills({ languageOther: [{ specialty: '', ...rated(0) }, { specialty: '', ...rated(0) }] });
    expect(screen.getByLabelText('Value of Language (Other), row 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Language (Other), row 2' })).toBeInTheDocument();
  });

  it('keep a specialty the lists do not offer, in the editor and on the read-only sheet', async () => {
    const stored = { firearm: [{ specialty: 'Harpoon Gun', ...rated(33) }] };
    const save = openSkills(stored);
    expect(screen.getByLabelText('Specialty of Firearm 1')).toHaveValue('Harpoon Gun');
    expect((await save()).firearm).toEqual(stored.firearm);

    render(<HorrorD100CharacterView character={horrorD100Character({ skills: blankSkills(stored) })} />);
    const tabs = screen.getAllByRole('tab', { name: 'Skills' });
    fireEvent.click(tabs[tabs.length - 1]);
    expect(screen.getByText('Firearm (Harpoon Gun)')).toBeInTheDocument();
  });
});

describe('a skill\'s notes', () => {
  it('are opened from its row, typed and saved', async () => {
    const save = openSkills();
    expect(screen.queryByLabelText('Notes on Spot')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Show notes on Spot' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide notes on Spot' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.change(screen.getByLabelText('Notes on Spot'), { target: { value: 'Sharp at dusk' } });
    expect((await save()).spot).toEqual({ value: 25, experienceCheck: false, notes: 'Sharp at dusk' });
  });

  it('are open on a row that has some, with every line kept', async () => {
    const save = openSkills({ listen: { ...rated(25), notes: 'One ear\nonly' } });
    expect(screen.getByLabelText('Notes on Listen')).toHaveValue('One ear\nonly');
    expect((await save()).listen.notes).toBe('One ear\nonly');
  });

  it('are shown under the skill on the read-only sheet', () => {
    render(<SkillsList skills={blankSkills({ listen: { ...rated(25), notes: 'One ear only' } })} />);
    expect(within(screen.getByText('Listen').closest('.group') as HTMLElement).getByText('One ear only')).toBeInTheDocument();
  });
});

describe('experience checks on the read-only sheet', () => {
  it('are marked on the skills that take one, and absent from Status and Knowledge (Blasphemous Lore)', () => {
    const skills = blankSkills({
      spot: { value: 25, experienceCheck: true },
      status: { value: 15, experienceCheck: true },
      knowledge: [{ specialty: 'Blasphemous Lore', value: 4, experienceCheck: true }, { specialty: 'Occult', value: 30, experienceCheck: true }],
    });
    render(<SkillsList skills={skills} />);
    const mark = (name: string) => within(rowOf(name)).queryByRole('img');
    expect(mark('Spot')).toHaveAccessibleName('Experience check ticked');
    expect(mark('Climb')).toHaveAccessibleName('No experience check');
    expect(mark('Knowledge (Occult)')).toHaveAccessibleName('Experience check ticked');
    expect(mark('Status')).toBeNull();
    expect(mark('Knowledge (Blasphemous Lore)')).toBeNull();
  });

  it('leave a tick stored on a skill that takes none as it was stored', async () => {
    const save = openSkills({ status: { value: 15, experienceCheck: true } });
    fireEvent.change(screen.getByLabelText('Value of Status'), { target: { value: '20' } });
    expect((await save()).status).toEqual({ value: 20, experienceCheck: true });
  });
});

describe('rolling a skill from the read-only sheet', () => {
  it.each([
    ['Spot', 'Spot — target: 25%'],
    ['Language (Own)', 'Language (Own) — target: 50%'],
    ['Firearm (Rifle)', 'Firearm (Rifle) — target: 40%'],
    ['Language (Latin)', 'Language (Latin) — target: 20%'],
    ['Charm', 'Charm — target: 45%'],
  ])('rolls %s at its value', (name, purpose) => {
    const onRoll = vi.fn();
    const skills = blankSkills({ firearm: [{ specialty: 'Rifle', ...rated(40) }], languageOther: [{ specialty: 'Latin', ...rated(20) }], own: [{ name: 'Charm', ...rated(45) }] });
    render(<SkillsList skills={skills} onRoll={onRoll} />);
    fireEvent.click(within(rowOf(name)).getByText(name));
    expect(onRoll).toHaveBeenCalledWith('1d100', purpose);
  });

  it('names the own language beside Language (Own)', () => {
    render(<SkillsList skills={blankSkills({ languageOwn: { language: 'Portuguese', ...rated(70) } })} characteristics={{ INT: 10 }} />);
    expect(rowOf('Language (Own)').textContent).toBe('Language (Own)(Portuguese)50%70%');
  });
});
