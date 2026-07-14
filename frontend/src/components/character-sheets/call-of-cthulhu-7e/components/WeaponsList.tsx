/**
 * WeaponsList Component
 *
 * Displays CoC-style weapons table with skill, damage, range, attacks, ammo, and malfunction.
 */

import React from 'react';
import { Swords, Plus, Trash2, Dices } from 'lucide-react';
import Button from '@/components/ui/Button';

interface Weapon {
  name: string;
  skill: string;
  skillValue: number;
  damage: string;
  range: string;
  attacks: number;
  ammo: number | null;
  malfunction: number | null;
  notes?: string;
}

interface WeaponsListProps {
  /** Array of weapons from character data */
  weapons: Weapon[];

  /** Edit mode */
  editable?: boolean;

  /** onChange handler for edit mode */
  onChange?: (weapons: Weapon[]) => void;

  /** Click to roll. Omit outside campaign context. */
  onRoll?: (expression: string, purpose: string) => void;
}

/**
 * WeaponsList - CoC-style weapons table
 */
export const WeaponsList: React.FC<WeaponsListProps> = ({
  weapons,
  editable = false,
  onChange,
  onRoll,
}) => {
  const handleWeaponChange = (index: number, field: keyof Weapon, value: any) => {
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
            variant="secondary" className="text-sm py-1 px-3 flex items-center space-x-1"
          >
            <Plus className="w-4 h-4" />
            <span>Add Weapon</span>
          </Button>
        )}
      </div>

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
                const skillPurpose = `${weapon.name} (${weapon.skill}) — target: ${weapon.skillValue}%`;
                return (
                <tr
                  key={index}
                  className={`border-b border-sepia-300 group ${isClickable ? 'cursor-pointer hover:bg-sepia-100/50 select-none' : 'hover:bg-parchment-light/30'}`}
                  onClick={isClickable ? () => onRoll!('1d100', skillPurpose) : undefined}
                  title={isClickable ? `Click to roll ${weapon.skill} (target: ${weapon.skillValue}%)` : undefined}
                >
                  {/* Name */}
                  <td className="px-3 py-2">
                    {editable ? (
                      <input
                        type="text"
                        value={weapon.name}
                        onChange={(e) => handleWeaponChange(index, 'name', e.target.value)}
                        className="w-full bg-white/50 border border-sepia-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sepia-500"
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
                        onChange={(e) => handleWeaponChange(index, 'skill', e.target.value)}
                        className="w-full bg-white/50 border border-sepia-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sepia-500"
                      />
                    ) : (
                      <span className="text-sepia-700">{weapon.skill}</span>
                    )}
                  </td>

                  {/* Skill Value */}
                  <td className="px-3 py-2 text-center">
                    {editable ? (
                      <input
                        type="number"
                        value={weapon.skillValue}
                        onChange={(e) => handleWeaponChange(index, 'skillValue', parseInt(e.target.value) || 0)}
                        className="w-16 bg-white/50 border border-sepia-400 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-sepia-500"
                        min={0}
                        max={99}
                      />
                    ) : (
                      <span className="font-semibold text-sepia-900">{weapon.skillValue}%</span>
                    )}
                  </td>

                  {/* Damage — click to roll damage separately */}
                  <td
                    className={`px-3 py-2 text-center ${isClickable && weapon.damage ? 'cursor-pointer hover:text-red-700 font-semibold' : ''}`}
                    onClick={isClickable && weapon.damage ? (e) => { e.stopPropagation(); onRoll!(weapon.damage, `${weapon.name} Damage`); } : undefined}
                    title={isClickable && weapon.damage ? `Click to roll damage: ${weapon.damage}` : undefined}
                  >
                    {editable ? (
                      <input
                        type="text"
                        value={weapon.damage}
                        onChange={(e) => handleWeaponChange(index, 'damage', e.target.value)}
                        className="w-20 bg-white/50 border border-sepia-400 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-sepia-500"
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
                        onChange={(e) => handleWeaponChange(index, 'range', e.target.value)}
                        className="w-20 bg-white/50 border border-sepia-400 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-sepia-500"
                        placeholder="Touch"
                      />
                    ) : (
                      <span className="text-sepia-700">{weapon.range}</span>
                    )}
                  </td>

                  {/* Attacks */}
                  <td className="px-3 py-2 text-center">
                    {editable ? (
                      <input
                        type="number"
                        value={weapon.attacks}
                        onChange={(e) => handleWeaponChange(index, 'attacks', parseInt(e.target.value) || 1)}
                        className="w-12 bg-white/50 border border-sepia-400 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-sepia-500"
                        min={1}
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
                        value={weapon.ammo || ''}
                        onChange={(e) => handleWeaponChange(index, 'ammo', e.target.value ? parseInt(e.target.value) : null)}
                        className="w-12 bg-white/50 border border-sepia-400 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-sepia-500"
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
                        value={weapon.malfunction || ''}
                        onChange={(e) => handleWeaponChange(index, 'malfunction', e.target.value ? parseInt(e.target.value) : null)}
                        className="w-12 bg-white/50 border border-sepia-400 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-sepia-500"
                        placeholder="—"
                        min={1}
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
                        className="p-1 hover:bg-red-100 rounded text-red-600 hover:text-red-700 transition-colors"
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
          <div><strong>Damage:</strong> Dice expression for damage (e.g., "1d10" or "1d3+DB")</div>
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
