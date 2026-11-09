/**
 * SpellcastingBlock Component
 *
 * Displays spellcasting ability, spell slots, cantrips, and spell lists by level.
 */

import React from 'react';
import { Sparkles, Circle, CircleDot, BookOpen, Zap } from 'lucide-react';
import { dnd5eSpellSaveDC, dnd5eSpellAttackBonus } from '@/utils/rules/dnd5e';
import { SPELL_SLOTS_MAX } from '@/constants/sheetLimits';

import type {
  DnD5eSpellcasting as Spellcasting,
  DnD5eSpell as Spell,
  DnD5eSpellSlot as SpellSlot,
} from '@/types/game-systems';

interface SpellcastingBlockProps {
  spellcasting: Spellcasting;
  /**
   * The whole sheet, so the save DC and attack bonus can be derived rather than
   * read from the stored copy. Both used to be typed in by hand and could sit
   * out of step with the proficiency bonus and ability that define them.
   */
  character?: unknown;
}

/**
 * SpellSlotIndicator - Visual representation of spell slots
 *
 * One mark per slot, up to the most slots a sheet can now save. A total above
 * that, stored before the limit, is written as a count alone: drawing a mark
 * for each of millions froze the browser.
 */
const SpellSlotIndicator: React.FC<{ slot: SpellSlot }> = ({ slot }) => {
  const total = Math.max(0, slot.total);
  const remaining = Math.min(total, Math.max(0, total - slot.expended));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {total <= SPELL_SLOTS_MAX &&
        Array.from({ length: total }).map((_, idx) => (
          <div key={idx} data-slot>
            {idx < remaining ? (
              <CircleDot className="w-3 h-3 text-info-ink" />
            ) : (
              <Circle className="w-3 h-3 text-ink-muted" />
            )}
          </div>
        ))}
      <span className="text-xs text-ink-secondary">
        {remaining}/{total}
      </span>
    </div>
  );
};

/** A stored slot, or null when it is not one with a usable count. */
function readSlot(value: unknown): SpellSlot | null {
  if (typeof value !== 'object' || value === null) return null;
  const { total, expended } = value as Record<string, unknown>;
  if (typeof total !== 'number' || !Number.isFinite(total)) return null;
  return { total, expended: typeof expended === 'number' && Number.isFinite(expended) ? expended : 0 };
}

/**
 * SpellRow - Single spell display
 */
const SpellRow: React.FC<{ spell: Spell }> = ({ spell }) => {
  return (
    <div className="flex items-center justify-between py-1 px-2 hover:bg-ink/5 rounded-sm">
      <div className="flex items-center space-x-2">
        {spell.prepared ? (
          <BookOpen className="w-4 h-4 text-info-ink" />
        ) : (
          <BookOpen className="w-4 h-4 text-ink-muted" />
        )}
        <span className={`text-sm ${spell.prepared ? 'text-ink font-medium' : 'text-ink-muted'}`}>
          {spell.name}
        </span>
        {spell.ritual && (
          <span className="px-1.5 py-0.5 text-xs bg-spirit/15 text-spirit-ink rounded-sm">
            R
          </span>
        )}
        {spell.concentration && (
          <span className="px-1.5 py-0.5 text-xs bg-warning/15 text-warning-ink rounded-sm">
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
export const SpellcastingBlock: React.FC<SpellcastingBlockProps> = ({
  spellcasting,
  character,
}) => {
  const formatBonus = (bonus: number): string => {
    return bonus >= 0 ? `+${bonus}` : `${bonus}`;
  };

  // Derived where the whole sheet is available, so the numbers cannot drift
  // from the proficiency bonus and ability that define them. Falls back to the
  // stored copy for the few callers that pass only the spellcasting block.
  const saveDC = character ? dnd5eSpellSaveDC(character) : spellcasting.spellSaveDC;
  const attackBonus = character
    ? dnd5eSpellAttackBonus(character)
    : (spellcasting.spellAttackBonus ?? 0);

  // Every list is optional on the stored sheet: a block can name an ability
  // and hold nothing else, and reading the missing lists threw.
  const spells: Spell[] = Array.isArray(spellcasting.spells) ? spellcasting.spells : [];
  const cantrips: string[] = Array.isArray(spellcasting.cantrips) ? spellcasting.cantrips : [];
  const slots = Object.entries(spellcasting.slots ?? {}).flatMap(([level, stored]) => {
    const slot = readSlot(stored);
    return slot && slot.total > 0 ? [[level, slot] as const] : [];
  });

  // Group spells by level
  const spellsByLevel = spells.reduce((acc, spell) => {
    if (!acc[spell.level]) {
      acc[spell.level] = [];
    }
    acc[spell.level].push(spell);
    return acc;
  }, {} as Record<number, Spell[]>);

  return (
    <div className="space-y-4">
      {/* Spellcasting Header */}
      <div className="p-4 bg-info/10 border-2 border-info/30 rounded-lg">
        <div className="flex items-center space-x-2 mb-3">
          <Sparkles className="w-5 h-5 text-info-ink" />
          <h4 className="font-semibold text-ink">
            {/* Without a class recorded this used to render " Spellcasting"
                with a leading gap — or, from the templates, "Wizard" on a sheet
                belonging to anything but a wizard. */}
            {spellcasting.class ? `${spellcasting.class} Spellcasting` : 'Spellcasting'}
          </h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-ink-muted">Spellcasting Ability</div>
            <div className="text-lg font-bold text-info-ink">{spellcasting.ability}</div>
          </div>
          <div>
            <div className="text-xs text-ink-muted">Spell Save DC</div>
            <div className="text-lg font-bold text-info-ink">{saveDC}</div>
          </div>
          <div>
            <div className="text-xs text-ink-muted">Spell Attack</div>
            <div className="text-lg font-bold text-info-ink">
              {formatBonus(attackBonus)}
            </div>
          </div>
        </div>
      </div>

      {/* Cantrips */}
      {cantrips.length > 0 && (
        <div className="bg-ink/5 border border-ink/10 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <Zap className="w-4 h-4 text-warning-ink" />
            <h5 className="font-semibold text-ink">Cantrips</h5>
          </div>
          <div className="flex flex-wrap gap-2">
            {cantrips.map((cantrip, idx) => (
              <span
                key={idx}
                className="px-2 py-1 text-sm bg-warning/15 text-warning-ink rounded-sm border border-warning/30"
              >
                {cantrip}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Spell Slots */}
      <div className="bg-ink/5 border border-ink/10 rounded-lg p-4">
        <h5 className="font-semibold text-ink mb-3">Spell Slots</h5>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {slots.map(([level, slot]) => (
            <div key={level} className="text-center">
              <div className="text-xs text-ink-muted mb-1">Level {level}</div>
              <SpellSlotIndicator slot={slot} />
            </div>
          ))}
        </div>
      </div>

      {/* Spells by Level */}
      <div className="bg-ink/5 border border-ink/10 rounded-lg overflow-hidden">
        <div className="p-3 bg-ink/10 border-b border-ink/10">
          <h5 className="font-semibold text-ink">Spell List</h5>
        </div>
        <div className="divide-y divide-ink/10">
          {Object.keys(spellsByLevel)
            .map(Number)
            .sort((a, b) => a - b)
            .map((level) => (
              <div key={level} className="p-3">
                <h6 className="text-sm font-semibold text-ink-secondary mb-2">
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
      <div className="text-xs text-ink-secondary space-y-1 px-2">
        <div className="flex items-center space-x-2">
          <BookOpen className="w-3 h-3 text-info-ink" />
          <span>Prepared spell</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-1.5 py-0.5 bg-spirit/15 text-spirit-ink rounded-sm">R</span>
          <span>Ritual</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-1.5 py-0.5 bg-warning/15 text-warning-ink rounded-sm">C</span>
          <span>Concentration</span>
        </div>
      </div>
    </div>
  );
};
