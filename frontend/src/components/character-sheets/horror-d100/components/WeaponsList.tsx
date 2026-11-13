// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * WeaponsList Component
 *
 * Displays the Horror d100 weapons table with skill, damage, range, attacks, ammo, and malfunction,
 * and each weapon's notes under its row.
 *
 * Below `sm` the table has no room for its eight or nine columns, so each
 * weapon is drawn as a card: its name across the top, then its figures two
 * to a row, each under its column's name, and the notes beneath. The markup
 * is one table either way; the classes turn its parts into blocks on a
 * narrow screen, where the heading row is hidden and each cell shows its
 * column's name from `data-label`.
 */

import React from 'react';
import { Swords, Plus, Trash2, Dices } from 'lucide-react';
import Button from '@/components/ui/Button';
import NumberField from '../../../ui/NumberField';
import ListLimitNote, { listIsFull } from '../../ListLimitNote';
import { LIMIT_NOTE_CLASS } from '../limitNoteClass';
import { HORROR_D100_VALUE_MAX, SHEET_LONG_TEXT_MAX, SHEET_SHORT_TEXT_MAX } from '@/constants/sheetLimits';
import type { HorrorD100SheetWeapon } from '@/types/game-systems/horrorD100Sheet';
import { HORROR_D100_FIXED_SKILLS, horrorD100DamageWithModifier, horrorD100WeaponSkillRating } from '@/utils/rules/horrorD100';
import { diceExpressionProblem } from '@/utils/diceExpression';
import { damagePurpose } from '@/utils/rollPurposes';
import { notARoll, sheetRoll } from '../../useSheetRolls';

// The weapon shape lives in types/game-systems. This file used to keep its own
// copy, which required `skill`, `damage` and the rest that the backend schema
// makes optional — so the two disagreed about what a saved weapon has to carry.
type Weapon = HorrorD100SheetWeapon;

interface WeaponsListProps {
  /** Array of weapons from character data */
  weapons: Weapon[];

  /** Edit mode */
  editable?: boolean;

  /** onChange handler for edit mode */
  onChange?: (weapons: Weapon[]) => void;

  /** Click to roll. Omit outside campaign context. */
  onRoll?: (expression: string, purpose: string) => void;

  /** The character's damage modifier, rolled where a weapon's damage says +dm. */
  damageModifier?: string;

  /** The character's skills, read for the value of the skill a weapon names. */
  skills?: unknown;

  /** Edit mode: what is wrong with a weapon's name, by its place in the list. */
  nameErrors?: Readonly<Record<number, string>>;
}

/** A cell: a block on a card below `sm`, a table cell from there up. */
const CELL = 'block sm:table-cell sm:px-3 sm:py-2';
/** A cell's column name, shown above it on a card and hidden where the heading row shows. */
const LABELLED = `${CELL} before:content-[attr(data-label)] before:block before:text-xs before:font-semibold before:text-ink-secondary before:mb-0.5 sm:before:hidden`;

/**
 * WeaponsList - the Horror d100 weapons table
 */
export const WeaponsList: React.FC<WeaponsListProps> = ({
  weapons,
  editable = false,
  onChange,
  onRoll,
  damageModifier = 'None',
  skills,
  nameErrors = {},
}) => {
  const handleWeaponChange = <K extends keyof Weapon>(index: number, field: K, value: Weapon[K]) => {
    if (!onChange) return;
    const updated = [...weapons];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const handleAddWeapon = () => {
    if (!onChange) return;
    const newWeapon: Weapon = {
      name: 'New Weapon',
      // A fist: Brawl at its base chance, 1D3 and the damage modifier, range
      // Short (open d100 rules, p. 197, Primitive Melee Weapons).
      skill: HORROR_D100_FIXED_SKILLS.brawl.name,
      skillValue: HORROR_D100_FIXED_SKILLS.brawl.base,
      damage: '1D3+dm',
      range: 'Short',
      attacks: 1,
      ammo: null,
      malfunction: null,
      notes: '',
    };
    onChange([...weapons, newWeapon]);
  };

  const handleDeleteWeapon = (index: number) => {
    if (!onChange) return;
    const updated = weapons.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <Swords className="w-5 h-5 text-ink-secondary" />
          <h3 className="text-lg font-bold text-ink">Weapons</h3>
        </div>
        {editable && (
          <Button
            onClick={handleAddWeapon}
            disabled={listIsFull(weapons)}
            variant="secondary" className="text-sm py-1 px-3 flex items-center space-x-1"
          >
            <Plus className="w-4 h-4" />
            <span>Add Weapon</span>
          </Button>
        )}
      </div>
      {editable && <ListLimitNote full={listIsFull(weapons)} className={LIMIT_NOTE_CLASS} />}

      {/* Weapons Table */}
      {weapons.length === 0 ? (
        <div className="text-center py-8 text-ink-secondary">
          <Swords className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No weapons equipped</p>
          {editable && (
            <p className="text-sm mt-1">Click "Add Weapon" to add a weapon</p>
          )}
        </div>
      ) : (
        <div className="sm:overflow-x-auto">
          <table className="w-full text-sm block sm:table">
            <thead className="hidden sm:table-header-group bg-ink/10 border-b-2 border-ink/20">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-ink">Weapon</th>
                <th className="px-3 py-2 text-left font-semibold text-ink">Skill</th>
                <th className="px-3 py-2 text-center font-semibold text-ink">Value</th>
                <th className="px-3 py-2 text-center font-semibold text-ink">Damage</th>
                <th className="px-3 py-2 text-center font-semibold text-ink">Range</th>
                <th className="px-3 py-2 text-center font-semibold text-ink">Atks</th>
                <th className="px-3 py-2 text-center font-semibold text-ink">Ammo</th>
                <th className="px-3 py-2 text-center font-semibold text-ink">Malf</th>
                {editable && <th className="px-3 py-2 w-10"></th>}
              </tr>
            </thead>
              {weapons.map((weapon, index) => {
                const isClickable = !!onRoll && !editable;
                // The skill the weapon names, where the sheet has it; the
                // value stored with the weapon goes stale as the skill rises.
                // A weapon with no value of its own, naming no skill the
                // sheet has, has nothing to roll at.
                const skillValue = horrorD100WeaponSkillRating(skills, weapon.skill ?? '', weapon.skillValue ?? Number.NaN);
                const rollsSkill = isClickable && !Number.isNaN(skillValue);
                // Without a stored value to fall back on, a skill the sheet
                // does not have reads as no number.
                const namedValue = horrorD100WeaponSkillRating(skills, weapon.skill ?? '', Number.NaN);
                const damageRoll = weapon.damage ? horrorD100DamageWithModifier(weapon.damage, damageModifier) : '';
                // Damage the dice cannot read is shown and not offered as a
                // roll: its title gives the parser's reason.
                const damageProblem = isClickable && damageRoll !== '' ? diceExpressionProblem(damageRoll) : null;
                const rollsDamage = isClickable && damageRoll !== '' && damageProblem === null;
                const skillPurpose = `${weapon.name} (${weapon.skill}) — target: ${skillValue}%`;
                const hasNotes = typeof weapon.notes === 'string' && weapon.notes !== '';
                return (
                <tbody key={index} className="block sm:table-row-group border border-ink/20 rounded-md p-3 mb-3 sm:border-0 sm:rounded-none sm:p-0 sm:mb-0">
                <tr
                  className={`grid grid-cols-2 gap-x-3 gap-y-2 sm:table-row ${editable || hasNotes ? '' : 'sm:border-b sm:border-ink/20'} group ${rollsSkill ? 'cursor-pointer hover:not-has-[[data-not-a-roll]:hover]:bg-ink/5 select-none' : 'hover:bg-ink/5'}`}
                  onClick={rollsSkill ? () => onRoll!('1d100', skillPurpose) : undefined}
                  title={rollsSkill ? `Click to roll ${weapon.skill} (target: ${skillValue}%)` : undefined}
                  {...(rollsSkill ? sheetRoll : undefined)}
                >
                  {/* Name */}
                  <td data-label="Weapon" className={`${LABELLED} col-span-2`}>
                    {editable ? (
                      <input
                        type="text"
                        value={weapon.name}
                        aria-label={`Name of weapon ${index + 1}`}
                        aria-invalid={nameErrors[index] ? true : undefined}
                        maxLength={SHEET_SHORT_TEXT_MAX}
                        onChange={(e) => handleWeaponChange(index, 'name', e.target.value)}
                        className={`w-full bg-paper rounded-sm px-2 py-1 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand ${nameErrors[index] ? 'border-2 border-danger' : 'border border-ink/20'}`}
                      />
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-ink">{weapon.name}</span>
                        {rollsSkill && <Dices className="w-3 h-3 text-ink-secondary opacity-0 group-hover:not-group-has-[[data-not-a-roll]:hover]:opacity-60 [@media(hover:none)]:opacity-60 transition-opacity" />}
                      </div>
                    )}
                  </td>

                  {/* Skill */}
                  <td data-label="Skill" className={LABELLED}>
                    {editable ? (
                      <input
                        type="text"
                        value={weapon.skill ?? ''}
                        aria-label={`Skill of weapon ${index + 1}`}
                        maxLength={SHEET_SHORT_TEXT_MAX}
                        onChange={(e) => handleWeaponChange(index, 'skill', e.target.value)}
                        className="w-full bg-paper border border-ink/20 rounded-sm px-2 py-1 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
                      />
                    ) : (
                      <span className="text-ink-secondary">{weapon.skill}</span>
                    )}
                  </td>

                  {/* Skill Value */}
                  <td data-label="Value" className={`${LABELLED} sm:text-center`}>
                    {editable ? (
                      <>
                        <NumberField
                          value={weapon.skillValue}
                          aria-label={`Skill value of weapon ${index + 1}`}
                          onChange={(v: number) => handleWeaponChange(index, 'skillValue', v)}
                          className="w-full sm:w-16 bg-paper border border-ink/20 rounded-sm px-2 py-1 text-sm text-center focus:outline-hidden focus:ring-2 focus:ring-brand"
                          min={0}
                          max={HORROR_D100_VALUE_MAX}
                          fallback={weapon.skillValue === undefined ? null : 0}
                        />
                        {/* The box is used only where the sheet has no such skill. */}
                        {!Number.isNaN(namedValue) && (
                          <div className="text-xs text-ink-secondary mt-0.5">Rolls at {namedValue}%, the sheet's {weapon.skill?.trim()}</div>
                        )}
                      </>
                    ) : (
                      <span className="font-semibold text-ink">{Number.isNaN(skillValue) ? '—' : `${skillValue}%`}</span>
                    )}
                  </td>

                  {/* Damage — click to roll damage separately. A click here never
                      reaches the row, which rolls the skill, even for damage
                      that cannot be rolled: that is handed to the table, which
                      says why it cannot roll it and sends nothing
                      (useTableRoll). */}
                  <td
                    data-label="Damage"
                    className={`${LABELLED} sm:text-center ${rollsDamage ? 'cursor-pointer hover:text-danger-ink font-semibold' : damageProblem ? 'cursor-default' : ''}`}
                    onClick={isClickable ? (e) => { e.stopPropagation(); if (damageRoll !== '') onRoll!(damageRoll, damagePurpose(weapon.name)); } : undefined}
                    title={rollsDamage ? `Click to roll damage: ${damageRoll}` : undefined}
                    {...(damageProblem ? notARoll(damageProblem) : undefined)}
                    {...(rollsDamage ? sheetRoll : undefined)}
                  >
                    {editable ? (
                      <input
                        type="text"
                        value={weapon.damage ?? ''}
                        aria-label={`Damage of weapon ${index + 1}`}
                        maxLength={SHEET_SHORT_TEXT_MAX}
                        onChange={(e) => handleWeaponChange(index, 'damage', e.target.value)}
                        className="w-full sm:w-20 bg-paper border border-ink/20 rounded-sm px-2 py-1 text-sm text-center focus:outline-hidden focus:ring-2 focus:ring-brand"
                        placeholder="1D6+dm"
                      />
                    ) : (
                      <span className="text-ink">{weapon.damage}</span>
                    )}
                  </td>

                  {/* Range */}
                  <td data-label="Range" className={`${LABELLED} sm:text-center`}>
                    {editable ? (
                      <input
                        type="text"
                        value={weapon.range ?? ''}
                        aria-label={`Range of weapon ${index + 1}`}
                        maxLength={SHEET_SHORT_TEXT_MAX}
                        onChange={(e) => handleWeaponChange(index, 'range', e.target.value)}
                        className="w-full sm:w-20 bg-paper border border-ink/20 rounded-sm px-2 py-1 text-sm text-center focus:outline-hidden focus:ring-2 focus:ring-brand"
                        placeholder="Short"
                      />
                    ) : (
                      <span className="text-ink-secondary">{weapon.range}</span>
                    )}
                  </td>

                  {/* Attacks */}
                  <td data-label="Atks" className={`${LABELLED} sm:text-center`}>
                    {editable ? (
                      <NumberField
                        value={weapon.attacks}
                        aria-label={`Attacks of weapon ${index + 1}`}
                        onChange={(v: number) => handleWeaponChange(index, 'attacks', v)}
                        className="w-full sm:w-12 bg-paper border border-ink/20 rounded-sm px-2 py-1 text-sm text-center focus:outline-hidden focus:ring-2 focus:ring-brand"
                        min={1}
                        fallback={weapon.attacks === undefined ? null : 1}
                      />
                    ) : (
                      <span className="text-ink">{weapon.attacks}</span>
                    )}
                  </td>

                  {/* Ammo */}
                  <td data-label="Ammo" className={`${LABELLED} sm:text-center`}>
                    {editable ? (
                      <input
                        type="number"
                        value={weapon.ammo ?? ''}
                        aria-label={`Ammunition of weapon ${index + 1}`}
                        onChange={(e) => handleWeaponChange(index, 'ammo', e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full sm:w-14 bg-paper border border-ink/20 rounded-sm px-2 py-1 text-sm text-center focus:outline-hidden focus:ring-2 focus:ring-brand"
                        placeholder="—"
                        min={0}
                      />
                    ) : (
                      <span className="text-ink-secondary">{weapon.ammo ?? '—'}</span>
                    )}
                  </td>

                  {/* Malfunction */}
                  <td data-label="Malf" className={`${LABELLED} sm:text-center`}>
                    {editable ? (
                      <input
                        type="number"
                        value={weapon.malfunction ?? ''}
                        aria-label={`Malfunction of weapon ${index + 1}`}
                        onChange={(e) => handleWeaponChange(index, 'malfunction', e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full sm:w-16 bg-paper border border-ink/20 rounded-sm px-2 py-1 text-sm text-center focus:outline-hidden focus:ring-2 focus:ring-brand"
                        placeholder="—"
                        min={0}
                        max={100}
                      />
                    ) : (
                      <span className="text-ink-secondary">{weapon.malfunction ?? '—'}</span>
                    )}
                  </td>

                  {/* Delete */}
                  {editable && (
                    <td className={`${CELL} col-span-2 text-right sm:text-left`}>
                      <button
                        type="button"
                        onClick={() => handleDeleteWeapon(index)}
                        aria-label={`Delete ${weapon.name || `weapon ${index + 1}`}`}
                        className="touch-target inline-flex items-center justify-center p-1 hover:bg-danger/10 rounded-sm text-danger-ink transition-colors"
                        title="Delete weapon"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
                {/* The weapon's notes, under its row: a box in the editor,
                    and on the read-only sheet a line where there are any. */}
                {(editable || hasNotes) && (
                  <tr className="block sm:table-row sm:border-b sm:border-ink/20">
                    <td colSpan={editable ? 9 : 8} className="block sm:table-cell pt-2 sm:pt-0 sm:px-3 sm:pb-2">
                      {editable ? (
                        <textarea
                          value={weapon.notes ?? ''}
                          aria-label={`Notes on weapon ${index + 1}`}
                          placeholder="Notes"
                          rows={1}
                          maxLength={SHEET_LONG_TEXT_MAX}
                          onChange={(e) => handleWeaponChange(index, 'notes', e.target.value)}
                          className="w-full bg-paper border border-ink/20 rounded-sm px-2 py-1 text-xs focus:outline-hidden focus:ring-2 focus:ring-brand"
                        />
                      ) : (
                        <p className="text-xs text-ink-secondary whitespace-pre-wrap">{weapon.notes}</p>
                      )}
                    </td>
                  </tr>
                )}
                </tbody>
                );
              })}
          </table>
        </div>
      )}

      {/* Notes/Legend */}
      <div className="bg-ink/5 rounded-md p-3">
        <div className="text-xs text-ink-secondary space-y-1">
          <div><strong>Skill:</strong> The skill used to attack with this weapon</div>
          <div><strong>Value:</strong> Your chance with the weapon, taken from the skill of that name where the sheet has one</div>
          <div><strong>Damage:</strong> Dice expression for damage (e.g., "1D10" or "1D3+dm"); dm rolls your damage modifier. Half the modifier ("+½dm"), for thrown weapons and bows, is dropped when you have none and otherwise left to roll yourself. Firearms take no damage modifier</div>
          <div><strong>Range:</strong> Short, Medium or Long for a hand-to-hand weapon; a distance for one that shoots or is thrown (25 meters, 80 meters)</div>
          <div><strong>Atks:</strong> Number of attacks per round</div>
          <div><strong>Ammo:</strong> Current ammunition count (firearms only)</div>
          <div><strong>Malf:</strong> Malfunction number (a roll of this or higher jams the weapon)</div>
        </div>
      </div>
    </div>
  );
};

export default WeaponsList;
