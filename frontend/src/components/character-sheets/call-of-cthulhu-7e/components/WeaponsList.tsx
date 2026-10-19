/**
 * WeaponsList Component
 *
 * Displays CoC-style weapons table with skill, damage, range, attacks, ammo, and malfunction.
 */

import React from 'react';
import { Swords, Plus, Trash2, Dices } from 'lucide-react';
import Button from '@/components/ui/Button';
import NumberField from '../../../ui/NumberField';
import ListLimitNote, { listIsFull } from '../../ListLimitNote';
import { LIMIT_NOTE_CLASS } from '../limitNoteClass';
import { SHEET_SHORT_TEXT_MAX } from '@/constants/sheetLimits';
import type { CoC7eWeapon } from '@/types/game-systems';
import { cocDamageWithBonus, cocWeaponSkillValue } from '@/utils/rules/callOfCthulhu7e';
import { isValidDiceExpression } from '@/utils/diceExpression';

// The weapon shape lives in types/game-systems. This file used to keep its own
// copy, which required `skill`, `damage` and the rest that the backend schema
// makes optional — so the two disagreed about what a saved weapon has to carry.
type Weapon = CoC7eWeapon;

interface WeaponsListProps {
  /** Array of weapons from character data */
  weapons: Weapon[];

  /** Edit mode */
  editable?: boolean;

  /** onChange handler for edit mode */
  onChange?: (weapons: Weapon[]) => void;

  /** Click to roll. Omit outside campaign context. */
  onRoll?: (expression: string, purpose: string) => void;

  /** The investigator's damage bonus, rolled where a weapon's damage says DB. */
  damageBonus?: string;

  /** The investigator's skills, read for the value of the skill a weapon names. */
  skills?: unknown;
}

/**
 * WeaponsList - CoC-style weapons table
 */
export const WeaponsList: React.FC<WeaponsListProps> = ({
  weapons,
  editable = false,
  onChange,
  onRoll,
  damageBonus = '0',
  skills,
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
      skill: 'Fighting (Brawl)',
      skillValue: 25,
      damage: '1d3',
      range: 'Touch',
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
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Swords className="w-5 h-5 text-sepia-700" />
          <h3 className="text-lg font-bold text-sepia-900">Weapons</h3>
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
        <div className="text-center py-8 text-sepia-600">
          <Swords className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No weapons equipped</p>
          {editable && (
            <p className="text-sm mt-1">Click "Add Weapon" to add a weapon</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-sepia-200 border-b-2 border-sepia-400">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-sepia-900">Weapon</th>
                <th className="px-3 py-2 text-left font-semibold text-sepia-900">Skill</th>
                <th className="px-3 py-2 text-center font-semibold text-sepia-900">Value</th>
                <th className="px-3 py-2 text-center font-semibold text-sepia-900">Damage</th>
                <th className="px-3 py-2 text-center font-semibold text-sepia-900">Range</th>
                <th className="px-3 py-2 text-center font-semibold text-sepia-900">Atks</th>
                <th className="px-3 py-2 text-center font-semibold text-sepia-900">Ammo</th>
                <th className="px-3 py-2 text-center font-semibold text-sepia-900">Malf</th>
                {editable && <th className="px-3 py-2 w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {weapons.map((weapon, index) => {
                const isClickable = !!onRoll && !editable;
                // The skill the weapon names, where the sheet has it; the
                // value stored with the weapon goes stale as the skill rises.
                const skillValue = cocWeaponSkillValue(skills, weapon.skill ?? '', weapon.skillValue ?? 0);
                const damageRoll = weapon.damage ? cocDamageWithBonus(weapon.damage, damageBonus) : '';
                // Damage the dice cannot read is shown and not offered as a roll.
                const rollsDamage = isClickable && damageRoll !== '' && isValidDiceExpression(damageRoll);
                const skillPurpose = `${weapon.name} (${weapon.skill}) — target: ${skillValue}%`;
                return (
                <tr
                  key={index}
                  className={`border-b border-sepia-300 group ${isClickable ? 'cursor-pointer hover:bg-sepia-100/50 select-none' : 'hover:bg-parchment-light/30'}`}
                  onClick={isClickable ? () => onRoll!('1d100', skillPurpose) : undefined}
                  title={isClickable ? `Click to roll ${weapon.skill} (target: ${skillValue}%)` : undefined}
                >
                  {/* Name */}
                  <td className="px-3 py-2">
                    {editable ? (
                      <input
                        type="text"
                        value={weapon.name}
                        aria-label={`Name of weapon ${index + 1}`}
                        maxLength={SHEET_SHORT_TEXT_MAX}
                        onChange={(e) => handleWeaponChange(index, 'name', e.target.value)}
                        className="w-full bg-white/50 border border-sepia-400 rounded-sm px-2 py-1 text-sm focus:outline-hidden focus:ring-2 focus:ring-sepia-500"
                      />
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-sepia-900">{weapon.name}</span>
                        {isClickable && <Dices className="w-3 h-3 text-sepia-600 opacity-0 group-hover:opacity-60 transition-opacity" />}
                      </div>
                    )}
                  </td>

                  {/* Skill */}
                  <td className="px-3 py-2">
                    {editable ? (
                      <input
                        type="text"
                        value={weapon.skill}
                        aria-label={`Skill of weapon ${index + 1}`}
                        maxLength={SHEET_SHORT_TEXT_MAX}
                        onChange={(e) => handleWeaponChange(index, 'skill', e.target.value)}
                        className="w-full bg-white/50 border border-sepia-400 rounded-sm px-2 py-1 text-sm focus:outline-hidden focus:ring-2 focus:ring-sepia-500"
                      />
                    ) : (
                      <span className="text-sepia-700">{weapon.skill}</span>
                    )}
                  </td>

                  {/* Skill Value */}
                  <td className="px-3 py-2 text-center">
                    {editable ? (
                      <NumberField
                        value={weapon.skillValue}
                        aria-label={`Skill value of weapon ${index + 1}`}
                        onChange={(v: number) => handleWeaponChange(index, 'skillValue', v)}
                        className="w-16 bg-white/50 border border-sepia-400 rounded-sm px-2 py-1 text-sm text-center focus:outline-hidden focus:ring-2 focus:ring-sepia-500"
                        min={0}
                        max={100}
                        fallback={0}
                      />
                    ) : (
                      <span className="font-semibold text-sepia-900">{skillValue}%</span>
                    )}
                  </td>

                  {/* Damage — click to roll damage separately */}
                  <td
                    className={`px-3 py-2 text-center ${rollsDamage ? 'cursor-pointer hover:text-red-700 font-semibold' : ''}`}
                    onClick={rollsDamage ? (e) => { e.stopPropagation(); onRoll!(damageRoll, `${weapon.name} Damage`); } : undefined}
                    title={rollsDamage ? `Click to roll damage: ${damageRoll}` : undefined}
                  >
                    {editable ? (
                      <input
                        type="text"
                        value={weapon.damage}
                        aria-label={`Damage of weapon ${index + 1}`}
                        maxLength={SHEET_SHORT_TEXT_MAX}
                        onChange={(e) => handleWeaponChange(index, 'damage', e.target.value)}
                        className="w-20 bg-white/50 border border-sepia-400 rounded-sm px-2 py-1 text-sm text-center focus:outline-hidden focus:ring-2 focus:ring-sepia-500"
                        placeholder="1d6"
                      />
                    ) : (
                      <span className="text-sepia-900">{weapon.damage}</span>
                    )}
                  </td>

                  {/* Range */}
                  <td className="px-3 py-2 text-center">
                    {editable ? (
                      <input
                        type="text"
                        value={weapon.range}
                        aria-label={`Range of weapon ${index + 1}`}
                        maxLength={SHEET_SHORT_TEXT_MAX}
                        onChange={(e) => handleWeaponChange(index, 'range', e.target.value)}
                        className="w-20 bg-white/50 border border-sepia-400 rounded-sm px-2 py-1 text-sm text-center focus:outline-hidden focus:ring-2 focus:ring-sepia-500"
                        placeholder="Touch"
                      />
                    ) : (
                      <span className="text-sepia-700">{weapon.range}</span>
                    )}
                  </td>

                  {/* Attacks */}
                  <td className="px-3 py-2 text-center">
                    {editable ? (
                      <NumberField
                        value={weapon.attacks}
                        aria-label={`Attacks of weapon ${index + 1}`}
                        onChange={(v: number) => handleWeaponChange(index, 'attacks', v)}
                        className="w-12 bg-white/50 border border-sepia-400 rounded-sm px-2 py-1 text-sm text-center focus:outline-hidden focus:ring-2 focus:ring-sepia-500"
                        min={1}
                        fallback={1}
                      />
                    ) : (
                      <span className="text-sepia-900">{weapon.attacks}</span>
                    )}
                  </td>

                  {/* Ammo */}
                  <td className="px-3 py-2 text-center">
                    {editable ? (
                      <input
                        type="number"
                        value={weapon.ammo ?? ''}
                        aria-label={`Ammunition of weapon ${index + 1}`}
                        onChange={(e) => handleWeaponChange(index, 'ammo', e.target.value ? parseInt(e.target.value) : null)}
                        className="w-12 bg-white/50 border border-sepia-400 rounded-sm px-2 py-1 text-sm text-center focus:outline-hidden focus:ring-2 focus:ring-sepia-500"
                        placeholder="—"
                        min={0}
                      />
                    ) : (
                      <span className="text-sepia-700">{weapon.ammo ?? '—'}</span>
                    )}
                  </td>

                  {/* Malfunction */}
                  <td className="px-3 py-2 text-center">
                    {editable ? (
                      <input
                        type="number"
                        value={weapon.malfunction ?? ''}
                        aria-label={`Malfunction of weapon ${index + 1}`}
                        onChange={(e) => handleWeaponChange(index, 'malfunction', e.target.value ? parseInt(e.target.value) : null)}
                        className="w-12 bg-white/50 border border-sepia-400 rounded-sm px-2 py-1 text-sm text-center focus:outline-hidden focus:ring-2 focus:ring-sepia-500"
                        placeholder="—"
                        min={0}
                        max={100}
                      />
                    ) : (
                      <span className="text-sepia-700">{weapon.malfunction ?? '—'}</span>
                    )}
                  </td>

                  {/* Delete */}
                  {editable && (
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleDeleteWeapon(index)}
                        className="p-1 hover:bg-red-100 rounded-sm text-red-600 hover:text-red-700 transition-colors"
                        title="Delete weapon"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes/Legend */}
      <div className="bg-sepia-100/50 rounded-md p-3">
        <div className="text-xs text-sepia-700 space-y-1">
          <div><strong>Skill:</strong> The skill used to attack with this weapon</div>
          <div><strong>Value:</strong> Your skill percentage (Regular / Half / Fifth)</div>
          <div><strong>Damage:</strong> Dice expression for damage (e.g., "1d10" or "1d3+DB"); DB rolls your damage bonus. Half DB, for thrown weapons and bows, is dropped when your bonus is 0 and otherwise left to roll yourself. Firearms take no damage bonus</div>
          <div><strong>Range:</strong> Effective range (Touch, 15 yards, 50 yards, etc.)</div>
          <div><strong>Atks:</strong> Number of attacks per round</div>
          <div><strong>Ammo:</strong> Current ammunition count (firearms only)</div>
          <div><strong>Malf:</strong> Malfunction number (if weapon rolls this or higher, it jams)</div>
        </div>
      </div>
    </div>
  );
};

export default WeaponsList;
