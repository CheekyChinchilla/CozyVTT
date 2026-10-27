/**
 * NpcRollPicker
 * DM-only floating modal that surfaces an NPC token's rollable options
 * (ability checks, saves, skills, attacks, damage) plus a free-form custom
 * roll input. Mirrors CharacterRollPicker for player-controlled tokens.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dices, X, ChevronDown } from 'lucide-react';
import type { Token } from '@/types';
import {
  withAdvantage,
  withDisadvantage,
  type RollOption,
  type CharacterRolls,
} from '@/utils/characterRolls';
import { buildNpcRolls } from '@/utils/npcRolls';
import CustomRollFooter from './CustomRollFooter';
import { tokenPublicName } from '@/utils/tokenDisplayName';
import { getModeLabels, systemSupportsAdvantage, type RollMode } from '@/utils/rollModes';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NpcRollPickerProps {
  token: Token;
  /** Optional game system override. Defaults to "DND_5E" for advantage UI. */
  gameSystem?: string | null;
  /**
   * Called with the expression, purpose, and the token's name. The name used to
   * be prefixed onto the purpose because the roll had nowhere else to carry it;
   * it now travels as the roll's subject instead, so the panel heads the entry
   * with the creature rather than with whoever pressed the button.
   */
  onRoll: (expression: string, purpose: string, characterName?: string) => void;
  onClose: () => void;
  anchorX: number;
  anchorY: number;
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  rolls: RollOption[];
  onRoll: (option: RollOption) => void;
}

const Section: React.FC<SectionProps> = ({ title, rolls, onRoll }) => {
  if (rolls.length === 0) return null;
  return (
    <div>
      <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-warm-gray bg-parchment/40">
        {title}
      </div>
      {rolls.map((opt, i) => (
        <button
          key={i}
          onClick={() => onRoll(opt)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-stone-gray hover:bg-moss-green/10 transition-colors text-left"
        >
          <Dices className="w-3 h-3 text-brand-ink shrink-0" />
          <span className="flex-1">{opt.label}</span>
        </button>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function NpcRollPicker({
  token,
  gameSystem = 'DND_5E',
  onRoll,
  onClose,
  anchorX,
  anchorY,
}: NpcRollPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const [mode, setMode] = useState<RollMode>('normal');
  const [modeOpen, setModeOpen] = useState(false);

  // The campaign's system decides what can be rolled from a stat block, not
  // just how the buttons are labelled. Call of Cthulhu and Shadowrun return
  // nothing and fall through to the custom roll input below, rather than being
  // offered D&D dice for games that have none.
  const rolls: CharacterRolls = useMemo(
    () => buildNpcRolls(token.statBlock ?? null, gameSystem ?? null),
    [token.statBlock, gameSystem]
  );

  const hasAdvantage = systemSupportsAdvantage(gameSystem ?? null);
  const modeLabels = getModeLabels(gameSystem ?? null);

  const hasAnyRolls =
    rolls.abilities.length > 0 ||
    rolls.skills.length > 0 ||
    rolls.savingThrows.length > 0 ||
    rolls.combat.length > 0;

  // Position picker, flipping if needed
  useEffect(() => {
    if (!pickerRef.current) return;
    const rect = pickerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = anchorX + rect.width  > vw ? Math.max(0, anchorX - rect.width)  : anchorX;
    const y = anchorY + rect.height > vh ? Math.max(0, anchorY - rect.height) : anchorY;
    setPos({ x, y });
  }, [anchorX, anchorY, hasAnyRolls]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape, which is used up: the map hears keys after this and
  // would otherwise also put its tool away on the same press.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleRollOption = (opt: RollOption) => {
    let expr = opt.expression;
    let purpose = opt.purpose;
    if (opt.supportsAdvantage && mode !== 'normal') {
      expr = mode === 'advantage' ? withAdvantage(expr) : withDisadvantage(expr);
      purpose = `${purpose} (${modeLabels[mode]})`;
    }
    onRoll(expr, purpose, tokenPublicName(token));
    onClose();
  };


  return (
    <div
      ref={pickerRef}
      className="fixed z-60 bg-soft-cream border-2 border-moss-green/30 rounded-lg shadow-2xl overflow-hidden flex flex-col"
      style={{
        left:       pos ? pos.x : anchorX,
        top:        pos ? pos.y : anchorY,
        visibility: pos ? 'visible' : 'hidden',
        minWidth:   260,
        maxWidth:   320,
        maxHeight:  560,
      }}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-moss-green/10 border-b border-moss-green/20">
        <div className="flex items-center gap-2">
          <Dices className="w-4 h-4 text-brand-ink" />
          <span className="text-sm font-semibold text-stone-gray truncate">
            Roll for {token.name}
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="p-0.5 touch-target inline-flex items-center justify-center rounded-sm hover:bg-moss-green/10 transition-colors">
          <X className="w-4 h-4 text-warm-gray" aria-hidden="true" />
        </button>
      </div>

      {/* Roll Mode Selector (d20 systems only) */}
      {hasAdvantage && hasAnyRolls && (
        <div className="shrink-0 px-3 py-2 border-b border-moss-green/10 bg-parchment/30">
          <div className="text-xs text-warm-gray mb-1">Roll mode</div>
          <div className="relative">
            <button
              onClick={() => setModeOpen((o) => !o)}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded-sm border border-moss-green/30 bg-paper/60 text-sm text-ink-secondary hover:bg-paper/80 transition-colors"
            >
              <span className={mode !== 'normal' ? 'text-warning-ink font-medium' : ''}>
                {modeLabels[mode]}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-warm-gray" />
            </button>
            {modeOpen && (
              <div className="absolute left-0 right-0 mt-1 bg-paper border border-ink-muted/20 rounded-lg shadow-lg z-10">
                {(['normal', 'advantage', 'disadvantage'] as RollMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setModeOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-moss-green/10 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      mode === m ? 'font-semibold text-brand-ink' : 'text-stone-gray'
                    }`}
                  >
                    {modeLabels[m]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!hasAnyRolls && (
          <div className="px-3 py-4 text-sm text-warm-gray text-center">
            No stat block on this token.
            <br />
            <span className="text-xs">Add one via Edit Token, or use a custom roll below.</span>
          </div>
        )}

        {hasAnyRolls && (
          <div className="divide-y divide-moss-green/10">
            <Section title="Abilities"     rolls={rolls.abilities}    onRoll={handleRollOption} />
            <Section title="Saving Throws" rolls={rolls.savingThrows} onRoll={handleRollOption} />
            <Section title="Skills"        rolls={rolls.skills}       onRoll={handleRollOption} />
            <Section title="Combat"        rolls={rolls.combat}       onRoll={handleRollOption} />
            {/* Always empty for a creature — a stat block has no pool to spend —
                but listed so the two pickers show the same categories. */}
            <Section title="Hit Dice"      rolls={rolls.hitDice}      onRoll={handleRollOption} />
          </div>
        )}
      </div>

      <CustomRollFooter
        onRoll={(expression, purpose) => { onRoll(expression, purpose, tokenPublicName(token)); onClose(); }}
      />
    </div>
  );
}
