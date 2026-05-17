/**
 * StrikesList Component
 *
 * Displays strikes/attacks with traits, proficiency, and damage information.
 * Pathfinder 2e strikes can be melee, ranged, or spells with saving throws.
 */

import React from 'react';
import { Sword, Target, Zap, Dices } from 'lucide-react';
import ProficiencyIndicator, { ProficiencyRank } from './ProficiencyIndicator';

export interface Strike {
  name: string;
  type: 'melee' | 'ranged';
  attackBonus: number | null;
  damageRoll: string;
  damageType: string;
  attributeModifier: string;
  proficiencyRank: ProficiencyRank;
  itemBonus: number;
  traits: string[];
  range: number | null;
  savingThrow?: string;
  notes?: string;
}

interface StrikesListProps {
  strikes: Strike[];
  onRoll?: (expression: string, purpose: string) => void;
  onRollContext?: (e: React.MouseEvent, expression: string, purpose: string) => void;
}

/**
 * Format attack bonus with sign
 */
const formatBonus = (bonus: number | null): string => {
  if (bonus === null) return '—';
  return bonus >= 0 ? `+${bonus}` : `${bonus}`;
};

/**
 * Get icon for strike type
 */
const getStrikeIcon = (type: string, savingThrow?: string) => {
  if (savingThrow) return Zap; // Spell attack
  return type === 'melee' ? Sword : Target;
};

export const StrikesList: React.FC<StrikesListProps> = ({ strikes, onRoll, onRollContext }) => {
  if (!strikes || strikes.length === 0) {
    return (
      <div className="text-center py-8 text-stone-500 italic">
        No strikes/attacks recorded
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {strikes.map((strike, index) => {
        const Icon = getStrikeIcon(strike.type, strike.savingThrow);
        const isMelee = strike.type === 'melee';
        const isClickable = !!onRoll && strike.attackBonus !== null && !strike.savingThrow;
        const attackExpr = strike.attackBonus !== null
          ? (strike.attackBonus >= 0 ? `1d20+${strike.attackBonus}` : `1d20${strike.attackBonus}`)
          : '';
        const attackPurpose = `${strike.name} Strike`;

        return (
          <div
            key={`${strike.name}-${index}`}
            className={`bg-white border-2 border-stone-200 rounded-lg p-4 shadow-sm transition-shadow group ${isClickable ? 'cursor-pointer hover:bg-blue-50 hover:border-blue-300 hover:shadow-md select-none' : 'hover:shadow-md'}`}
            onClick={isClickable ? () => onRoll!(attackExpr, attackPurpose) : undefined}
            onContextMenu={isClickable && onRollContext ? (e) => { e.preventDefault(); onRollContext(e, attackExpr, attackPurpose); } : undefined}
            title={isClickable ? `Left-click: roll attack  |  Right-click: Fortune / Misfortune` : undefined}
          >
            {/* Strike Header */}
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center space-x-2 flex-1">
                <Icon className={`w-5 h-5 ${isMelee ? 'text-red-600' : 'text-blue-600'}`} />
                <h4 className="font-bold text-stone-800 text-lg">{strike.name}</h4>
                <ProficiencyIndicator rank={strike.proficiencyRank} size="sm" />
                {isClickable && <Dices className="w-4 h-4 text-blue-600 opacity-0 group-hover:opacity-60 transition-opacity" />}
              </div>
              <div className="text-right">
                <div className="text-xs text-stone-500 uppercase tracking-wide">
                  {strike.type}
                  {strike.range !== null && ` (${strike.range} ft.)`}
                </div>
              </div>
            </div>

            {/* Strike Stats */}
            <div className="grid grid-cols-2 gap-4 mb-2">
              {/* Attack Bonus or Saving Throw */}
              <div>
                <div className="text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1">
                  {strike.savingThrow ? 'Saving Throw' : 'Attack'}
                </div>
                <div className="text-2xl font-bold text-blue-700">
                  {strike.savingThrow ? (
                    <span className="text-lg capitalize">{strike.savingThrow}</span>
                  ) : (
                    formatBonus(strike.attackBonus)
                  )}
                </div>
              </div>

              {/* Damage — click separately */}
              <div
                className={onRoll && strike.damageRoll ? 'cursor-pointer hover:text-red-700' : ''}
                onClick={onRoll && strike.damageRoll ? (e) => { e.stopPropagation(); onRoll(strike.damageRoll, `${strike.name} Damage`); } : undefined}
                title={onRoll && strike.damageRoll ? `Click to roll damage: ${strike.damageRoll}` : undefined}
              >
                <div className="text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1">
                  Damage
                </div>
                <div className="text-xl font-bold text-red-700">
                  {strike.damageRoll}
                  <span className="text-sm text-stone-600 ml-1 capitalize">
                    {strike.damageType}
                  </span>
                </div>
              </div>
            </div>

            {/* Traits */}
            {strike.traits && strike.traits.length > 0 && (
              <div className="mb-2">
                <div className="text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1">
                  Traits
                </div>
                <div className="flex flex-wrap gap-1">
                  {strike.traits.map((trait, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium"
                    >
                      {trait}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {strike.notes && (
              <div className="mt-2 text-sm text-stone-600 italic border-t border-stone-200 pt-2">
                {strike.notes}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StrikesList;
