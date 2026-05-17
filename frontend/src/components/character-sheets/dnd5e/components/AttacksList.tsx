/**
 * AttacksList Component
 *
 * Displays character attacks and weapons with damage, range, and properties.
 */

import React from 'react';
import { Sword, Zap, Dices } from 'lucide-react';

interface Attack {
  name: string;
  attackBonus: number;
  damageRoll: string;
  damageType: string;
  range: number;
  properties: string[];
  notes: string;
}

interface AttacksListProps {
  attacks: Attack[];
  /** Left-click attack row to roll attack. Omit outside campaign context. */
  onRoll?: (expression: string, purpose: string) => void;
  /** Right-click for Advantage / Disadvantage popup. */
  onRollContext?: (e: React.MouseEvent, expression: string, purpose: string) => void;
}

/**
 * AttackRow - Single attack display
 */
const AttackRow: React.FC<{
  attack: Attack;
  onRoll?: (expression: string, purpose: string) => void;
  onRollContext?: (e: React.MouseEvent, expression: string, purpose: string) => void;
}> = ({ attack, onRoll, onRollContext }) => {
  const formatBonus = (bonus: number): string => {
    return bonus >= 0 ? `+${bonus}` : `${bonus}`;
  };

  // Determine if this is a spell attack (cantrip/spell) or weapon attack
  const isSpell = attack.name.toLowerCase().includes('cantrip') ||
                  attack.name.toLowerCase().includes('spell');

  const attackExpr = `1d20${formatBonus(attack.attackBonus)}`;
  const attackPurpose = `${attack.name} Attack`;
  const isClickable = !!onRoll;

  const handleAttackClick = () => {
    if (onRoll) onRoll(attackExpr, attackPurpose);
  };

  const handleAttackContext = (e: React.MouseEvent) => {
    if (onRollContext) { e.preventDefault(); onRollContext(e, attackExpr, attackPurpose); }
  };

  const handleDamageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRoll && attack.damageRoll) onRoll(attack.damageRoll, `${attack.name} Damage`);
  };

  return (
    <div
      className={`p-3 bg-stone-50 border border-stone-200 rounded-lg transition-colors group ${
        isClickable ? 'cursor-pointer hover:bg-red-50 hover:border-red-200 select-none' : 'hover:bg-stone-100'
      }`}
      onClick={isClickable ? handleAttackClick : undefined}
      onContextMenu={isClickable ? handleAttackContext : undefined}
      title={isClickable ? `Left-click: roll attack  |  Right-click: Advantage / Disadvantage` : undefined}
    >
      {/* Attack Name & Icon */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          {isSpell ? (
            <Zap className="w-5 h-5 text-red-600" />
          ) : (
            <Sword className="w-5 h-5 text-stone-600" />
          )}
          <span className="font-semibold text-stone-800">{attack.name}</span>
        </div>
        {isClickable && (
          <Dices className="w-4 h-4 text-red-700 opacity-0 group-hover:opacity-60 transition-opacity" />
        )}
      </div>

      {/* Attack Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        {/* Attack Bonus */}
        <div>
          <span className="text-xs text-stone-500">Attack</span>
          <div className="font-semibold text-red-700">
            {formatBonus(attack.attackBonus)}
          </div>
        </div>

        {/* Damage — click separately to roll damage only */}
        <div
          className={isClickable && attack.damageRoll ? 'cursor-pointer hover:text-red-700' : ''}
          onClick={isClickable && attack.damageRoll ? handleDamageClick : undefined}
          title={isClickable && attack.damageRoll ? `Click to roll damage: ${attack.damageRoll}` : undefined}
        >
          <span className="text-xs text-stone-500">Damage</span>
          <div className="font-semibold text-stone-700">
            {attack.damageRoll}
          </div>
        </div>

        {/* Damage Type */}
        <div>
          <span className="text-xs text-stone-500">Type</span>
          <div className="font-semibold text-stone-700 capitalize">
            {attack.damageType}
          </div>
        </div>

        {/* Range */}
        <div>
          <span className="text-xs text-stone-500">Range</span>
          <div className="font-semibold text-stone-700">
            {attack.range} ft
          </div>
        </div>
      </div>

      {/* Properties */}
      {attack.properties && attack.properties.length > 0 && (
        <div className="mt-2">
          <div className="flex flex-wrap gap-1">
            {attack.properties.map((prop, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 text-xs bg-stone-200 text-stone-700 rounded-full capitalize"
              >
                {prop}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {attack.notes && (
        <div className="mt-2 text-xs text-stone-600 italic">
          {attack.notes}
        </div>
      )}
    </div>
  );
};

/**
 * AttacksList - Displays all attacks
 */
export const AttacksList: React.FC<AttacksListProps> = ({ attacks, onRoll, onRollContext }) => {
  if (!attacks || attacks.length === 0) {
    return (
      <div className="text-center py-8 text-stone-500">
        No attacks configured
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {attacks.map((attack, index) => (
        <AttackRow key={index} attack={attack} onRoll={onRoll} onRollContext={onRollContext} />
      ))}
    </div>
  );
};
