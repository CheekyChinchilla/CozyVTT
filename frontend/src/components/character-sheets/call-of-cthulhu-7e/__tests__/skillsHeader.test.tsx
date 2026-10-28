/**
 * The Call of Cthulhu skills header sits over the skills' columns.
 *
 * The header put its labels in a row of their own width, so "Skill Name" had
 * nothing to grow into and Base, Value and "½ / ⅕" sat just after it, at the
 * left of a wide sheet, while the rows' numbers sat at the right. The rows'
 * half and fifth took the width of their digits, so a skill's value box
 * moved with its half and fifth ("2 / 1" or "12 / 5"), and in the editor the
 * rows with a remove button had a column the others did not. The header and
 * the rows now share each column's width, the half and fifth have one of
 * their own, and every editor row keeps the remove button's column.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkillsList } from '../components/SkillsList';

const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
/** The classes that decide how wide a column is. */
const widths = (element: Element) =>
  classes(element).filter((c) => /^(?:[\w-]+:)*(?:w-|min-w-|flex-1$|shrink-0$|basis-)/.test(c));

const skill = (value: number) => ({ baseValue: value, currentValue: value, improvementChecked: false });
const SKILLS = {
  accounting: skill(5),
  libraryUse: skill(25),
  languageOther: [{ ...skill(1), language: 'Latin' }],
};

const header = () => screen.getByText('Skill Name').parentElement!;
/** The row a skill's name is in. */
const row = (name: string) => screen.getByText(name).closest('.group')!;

describe('the skills header', () => {
  it.each([
    ['read-only', false],
    ['in the editor', true],
  ])('puts each label over its column (%s)', (_mode, editable) => {
    render(<SkillsList skills={SKILLS} editable={editable} onChange={vi.fn()} onListChange={vi.fn()} />);
    const labels = [...header().children];
    const cells = [...(editable ? screen.getByLabelText('Value of Accounting').closest('.group')! : row('Accounting')).children];
    expect(labels).toHaveLength(cells.length);
    labels.forEach((label, i) => expect(widths(label)).toEqual(widths(cells[i])));
  });

  it('gives the half and fifth a column of one width, so the value boxes line up', () => {
    render(<SkillsList skills={SKILLS} />);
    const reference = row('Accounting').children[4];
    expect(reference.textContent).toBe('2/1');
    expect(widths(reference)).toContain('w-12');
    expect(widths(row('Library Use').children[4])).toEqual(widths(reference));
  });

  it('keeps the remove button\'s column on every editor row', () => {
    render(<SkillsList skills={SKILLS} editable onChange={vi.fn()} onListChange={vi.fn()} />);
    const plain = screen.getByLabelText('Value of Accounting').closest('.group')!;
    const removable = screen.getByRole('button', { name: 'Remove Language (Latin)' });
    const spacer = plain.lastElementChild!;
    expect(spacer.getAttribute('aria-hidden')).toBe('true');
    expect(widths(spacer)).toEqual(widths(removable));
    expect(plain.children).toHaveLength(removable.parentElement!.children.length);
  });
});
