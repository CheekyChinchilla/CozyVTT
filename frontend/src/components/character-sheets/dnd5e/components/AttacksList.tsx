/**
 * AttacksList Component
 *
 * Displays character attacks and weapons with damage, range, and properties.
 */

import React from 'react';
import { Sword, Zap, Dices } from 'lucide-react';
import type { DnD5eAttack } from '@/types/game-systems/dnd5e';
import { rollTarget } from '../../useSheetRolls';

/**
 * The attack shape was declared again here, a copy of `DnD5eAttack` that had to
 * be kept in step by hand. It is imported now, so a field added to the sheet
 * cannot go missing from the list that displays it.
 */
type Attack = DnD5eAttack;

interface AttacksListProps {
  attacks: Attack[];
  /**
   * Left-click an attack row to roll the attack, a d20 test the sheet's Roll
   * mode applies to. Omit outside campaign context.
   */
  onRollAttack?: (expression: string, purpose: string) => void;
  /** Click a damage roll to roll it as written. */
  onRollDamage?: (expression: string, purpose: string) => void;
}

/**
 * AttackRow - Single attack display
 */
const AttackRow: React.FC<{
  attack: Attack;
  onRollAttack?: (expression: string, purpose: string) => void;
  onRollDamage?: (expression: string, purpose: string) => void;
}> = ({ attack, onRollAttack, onRollDamage }) => {
  const formatBonus = (bonus: number): string => {
    return bonus >= 0 ? `+${bonus}` : `${bonus}`;
  };

  // Determine if this is a spell attack (cantrip/spell) or weapon attack
  const isSpell = attack.name.toLowerCase().includes('cantrip') ||
                  attack.name.toLowerCase().includes('spell');

  const attackExpr = `1d20${formatBonus(attack.attackBonus)}`;
  const attackPurpose = `${attack.name} Attack`;
  const isClickable = !!onRollAttack;

  const handleAttackClick = () => {
    if (onRollAttack) onRollAttack(attackExpr, attackPurpose);
  };

  const handleDamageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRollDamage && attack.damageRoll) onRollDamage(attack.damageRoll, `${attack.name} Damage`);
  };

  return (
    <div
      className={`p-3 bg-ink/5 border border-ink/10 rounded-lg transition-colors group ${
        isClickable ? 'cursor-pointer hover:bg-accent/10 hover:border-accent/30 select-none [-webkit-touch-callout:none]' : 'hover:bg-ink/10'
      }`}
      onClick={isClickable ? handleAttackClick : undefined}
      {...(isClickable ? rollTarget(attackExpr, attackPurpose, 'DND_5E') : undefined)}
    >
      {/* Attack Name & Icon */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          {isSpell ? (
            <Zap className="w-5 h-5 text-accent-ink" />
          ) : (
            <Sword className="w-5 h-5 text-ink-secondary" />
          )}
          <span className="font-semibold text-ink">{attack.name}</span>
        </div>
        {isClickable && (
          <Dices className="w-4 h-4 text-accent-ink opacity-0 group-hover:opacity-60 [@media(hover:none)]:opacity-60 transition-opacity" />
        )}
      </div>

      {/* Attack Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        {/* Attack Bonus */}
        <div>
          <span className="text-xs text-ink-muted">Attack</span>
          <div className="font-semibold text-accent-ink">
            {formatBonus(attack.attackBonus)}
          </div>
        </div>

        {/* Damage — click separately to roll damage only */}
        <div
          className={onRollDamage && attack.damageRoll ? 'cursor-pointer hover:text-danger-ink' : ''}
          onClick={onRollDamage && attack.damageRoll ? handleDamageClick : undefined}
          title={onRollDamage && attack.damageRoll ? `Click to roll damage: ${attack.damageRoll}` : undefined}
        >
          <span className="text-xs text-ink-muted">Damage</span>
          <div className="font-semibold text-ink-secondary">
            {attack.damageRoll}
          </div>
        </div>

        {/* Damage Type */}
        <div>
          <span className="text-xs text-ink-muted">Type</span>
          <div className="font-semibold text-ink-secondary capitalize">
            {attack.damageType}
          </div>
        </div>

        {/* Range */}
        <div>
          <span className="text-xs text-ink-muted">Range</span>
          <div className="font-semibold text-ink-secondary">
            {attack.range != null ? `${attack.range} ft` : '—'}
          </div>
        </div>
      </div>

      {/* Further damage lines — a versatile weapon's two-handed die, a spell's
          higher-level damage. Each rolls on its own, like the primary one. */}
      {(attack.additionalDamage ?? []).some((entry) => entry.damageRoll?.trim()) && (
        <div className="mt-2 space-y-1">
          {(attack.additionalDamage ?? [])
            .filter((entry) => entry.damageRoll?.trim())
            .map((entry, idx) => {
              const roll = (entry.damageRoll ?? '').trim();
              const label = entry.label?.trim() || 'Alternate';
              const rollable = !!onRollDamage;
              return (
                <div
                  key={idx}
                  className={`flex items-baseline gap-2 text-sm ${
                    rollable ? 'cursor-pointer hover:text-danger-ink' : ''
                  }`}
                  onClick={
                    rollable
                      ? (e) => {
                          e.stopPropagation();
                          onRollDamage?.(roll, `${attack.name} — ${label}`);
                        }
                      : undefined
                  }
                  title={rollable ? `Click to roll ${label}: ${roll}` : undefined}
                >
                  <span className="text-xs text-ink-muted">{label}</span>
                  <span className="font-semibold text-ink-secondary">{roll}</span>
                  {entry.damageType && (
                    <span className="text-xs text-ink-muted capitalize">{entry.damageType}</span>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Properties */}
      {attack.properties && attack.properties.length > 0 && (
        <div className="mt-2">
          <div className="flex flex-wrap gap-1">
            {attack.properties.map((prop, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 text-xs bg-ink/15 text-ink-secondary rounded-full capitalize"
              >
                {prop}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {attack.notes && (
        <div className="mt-2 text-xs text-ink-secondary italic">
          {attack.notes}
        </div>
      )}
    </div>
  );
};

/**
 * AttacksList - Displays all attacks
 */
export const AttacksList: React.FC<AttacksListProps> = ({ attacks, onRollAttack, onRollDamage }) => {
  if (!attacks || attacks.length === 0) {
    return (
      <div className="text-center py-8 text-ink-muted">
        No attacks configured
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {attacks.map((attack, index) => (
        <AttackRow key={index} attack={attack} onRollAttack={onRollAttack} onRollDamage={onRollDamage} />
      ))}
    </div>
  );
};
