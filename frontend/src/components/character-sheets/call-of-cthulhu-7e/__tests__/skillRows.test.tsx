/**
 * Every Call of Cthulhu skill rolls from the sheet, under its own name once.
 *
 * The Firearms, Other Language and Science rows were drawn without a roll, so
 * clicking them did nothing where every other skill rolled, and the last two
 * printed their language or specialisation twice: "Science (Physics)
 * (Physics)".
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkillsList } from '../components/SkillsList';

const skill = (value: number) => ({ baseValue: value, currentValue: value, improvementChecked: false });

function sheet() {
  const onRoll = vi.fn();
  render(
    <SkillsList
      skills={{
        firearms: { handgun: skill(20), rifle: skill(25), shotgun: skill(25), custom: [] },
        languageOther: [{ ...skill(1), language: 'Latin' }],
        science: [{ ...skill(1), specialization: 'Physics' }],
        languageOwn: { ...skill(60), language: 'English' },
      }}
      onRoll={onRoll}
    />
  );
  return onRoll;
}

describe('the specialised skill rows', () => {
  it.each([
    ['Firearms (Handgun)'],
    ['Language (Latin)'],
    ['Science (Physics)'],
  ])('%s rolls from the sheet', (name) => {
    const onRoll = sheet();
    fireEvent.click(screen.getByText(name));
    expect(onRoll).toHaveBeenCalledWith('1d100', expect.stringContaining(name));
  });

  it('name the language or specialisation once', () => {
    sheet();
    expect(screen.getAllByText(/Physics/)).toHaveLength(1);
    expect(screen.getAllByText(/Latin/)).toHaveLength(1);
  });

  it('keep the own language beside Language (Own)', () => {
    sheet();
    expect(screen.getByText('(English)')).toBeInTheDocument();
  });
});
