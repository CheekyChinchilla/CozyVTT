/**
 * SpellcastingBlock Component
 *
 * Displays spellcasting ability, spell slots, cantrips, and spell lists by level.
 */

import React from 'react';
import { Sparkles, Circle, CircleDot, BookOpen, Zap } from 'lucide-react';

interface SpellSlot {
  total: number;
  expended: number;
}

interface Spell {
  level: number;
  name: string;
  prepared: boolean;
  ritual: boolean;
  concentration: boolean;
}

interface Spellcasting {
  class: string;
  ability: string;
  spellSaveDC: number;
  spellAttackBonus: number;
  cantrips: string[];
  slots: {
    '1': SpellSlot;
    '2': SpellSlot;
    '3': SpellSlot;
    '4': SpellSlot;
    '5': SpellSlot;
    '6': SpellSlot;
    '7': SpellSlot;
    '8': SpellSlot;
    '9': SpellSlot;
  };
  spells: Spell[];
}

interface SpellcastingBlockProps {
  spellcasting: Spellcasting;
}

/**
 * SpellSlotIndicator - Visual representation of spell slots
 */
const SpellSlotIndicator: React.FC<{ slot: SpellSlot }> = ({ slot }) => {
  const remaining = slot.total - slot.expended;

  return (
    <div className="flex items-center space-x-1">
      {Array.from({ length: slot.total }).map((_, idx) => (
        <div key={idx}>
          {idx < remaining ? (
            <CircleDot className="w-3 h-3 text-blue-600" />
          ) : (
            <Circle className="w-3 h-3 text-stone-300" />
          )}
        </div>
      ))}
      <span className="text-xs text-stone-600 ml-1">
        {remaining}/{slot.total}
      </span>
    </div>
  );
};

/**
 * SpellRow - Single spell display
 */
const SpellRow: React.FC<{ spell: Spell }> = ({ spell }) => {
  return (
    <div className="flex items-center justify-between py-1 px-2 hover:bg-stone-50 rounded">
      <div className="flex items-center space-x-2">
        {spell.prepared ? (
          <BookOpen className="w-4 h-4 text-blue-600" />
        ) : (
          <BookOpen className="w-4 h-4 text-stone-300" />
        )}
        <span className={`text-sm ${spell.prepared ? 'text-stone-800 font-medium' : 'text-stone-500'}`}>
          {spell.name}
        </span>
        {spell.ritual && (
          <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
            R
          </span>
        )}
        {spell.concentration && (
          <span className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded">
            C
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * SpellcastingBlock - Complete spellcasting display
 */
export const SpellcastingBlock: React.FC<SpellcastingBlockProps> = ({ spellcasting }) => {
  const formatBonus = (bonus: number): string => {
    return bonus >= 0 ? `+${bonus}` : `${bonus}`;
  };

  // Group spells by level
  const spellsByLevel = spellcasting.spells.reduce((acc, spell) => {
    if (!acc[spell.level]) {
      acc[spell.level] = [];
    }
    acc[spell.level].push(spell);
    return acc;
  }, {} as Record<number, Spell[]>);

  return (
    <div className="space-y-4">
      {/* Spellcasting Header */}
      <div className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-lg">
        <div className="flex items-center space-x-2 mb-3">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <h4 className="font-semibold text-stone-800">
            {spellcasting.class} Spellcasting
          </h4>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-stone-500">Spellcasting Ability</div>
            <div className="text-lg font-bold text-blue-700">{spellcasting.ability}</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">Spell Save DC</div>
            <div className="text-lg font-bold text-blue-700">{spellcasting.spellSaveDC}</div>
          </div>
          <div>
            <div className="text-xs text-stone-500">Spell Attack</div>
            <div className="text-lg font-bold text-blue-700">
              {formatBonus(spellcasting.spellAttackBonus)}
            </div>
          </div>
        </div>
      </div>

      {/* Cantrips */}
      {spellcasting.cantrips && spellcasting.cantrips.length > 0 && (
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Zap className="w-4 h-4 text-yellow-600" />
            <h5 className="font-semibold text-stone-800">Cantrips</h5>
          </div>
          <div className="flex flex-wrap gap-2">
            {spellcasting.cantrips.map((cantrip, idx) => (
              <span
                key={idx}
                className="px-2 py-1 text-sm bg-yellow-100 text-yellow-800 rounded border border-yellow-300"
              >
                {cantrip}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Spell Slots */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h5 className="font-semibold text-stone-800 mb-3">Spell Slots</h5>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {Object.entries(spellcasting.slots)
            .filter(([_, slot]) => slot.total > 0)
            .map(([level, slot]) => (
              <div key={level} className="text-center">
                <div className="text-xs text-stone-500 mb-1">Level {level}</div>
                <SpellSlotIndicator slot={slot} />
              </div>
            ))}
        </div>
      </div>

      {/* Spells by Level */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg overflow-hidden">
        <div className="p-3 bg-stone-100 border-b border-stone-200">
          <h5 className="font-semibold text-stone-800">Spell List</h5>
        </div>
        <div className="divide-y divide-stone-100">
          {Object.keys(spellsByLevel)
            .map(Number)
            .sort((a, b) => a - b)
            .map((level) => (
              <div key={level} className="p-3">
                <h6 className="text-sm font-semibold text-stone-700 mb-2">
                  {level === 0 ? 'Cantrips' : `Level ${level}`}
                </h6>
                <div className="space-y-1">
                  {spellsByLevel[level].map((spell, idx) => (
                    <SpellRow key={idx} spell={spell} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Legend */}
      <div className="text-xs text-stone-600 space-y-1 px-2">
        <div className="flex items-center space-x-2">
          <BookOpen className="w-3 h-3 text-blue-600" />
          <span>Prepared spell</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">R</span>
          <span>Ritual</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">C</span>
          <span>Concentration</span>
        </div>
      </div>
    </div>
  );
};
