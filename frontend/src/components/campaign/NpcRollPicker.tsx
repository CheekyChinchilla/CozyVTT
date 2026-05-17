/**
 * NpcRollPicker
 * DM-only floating modal that surfaces an NPC token's rollable options
 * (ability checks, saves, skills, attacks, damage) plus a free-form custom
 * roll input. Mirrors CharacterRollPicker for player-controlled tokens.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dices, X, ChevronDown, Plus } from 'lucide-react';
import type { Token } from '@/types';
import {
  withAdvantage,
  withDisadvantage,
  isValidDiceExpression,
  type RollOption,
  type CharacterRolls,
} from '@/utils/characterRolls';
import { buildNpcRolls } from '@/utils/npcRolls';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NpcRollPickerProps {
  token: Token;
  /** Optional game system override. Defaults to "DND_5E" for advantage UI. */
  gameSystem?: string | null;
  onRoll: (expression: string, purpose: string) => void;
  onClose: () => void;
  anchorX: number;
  anchorY: number;
}

type RollMode = 'normal' | 'advantage' | 'disadvantage';

// ---------------------------------------------------------------------------
// Mode labels
// ---------------------------------------------------------------------------

const MODE_LABELS: Record<string, Record<RollMode, string>> = {
  DND_5E:        { normal: 'Normal', advantage: 'Advantage', disadvantage: 'Disadvantage' },
  PATHFINDER_2E: { normal: 'Normal', advantage: 'Fortune',   disadvantage: 'Misfortune' },
};

function getModeLabels(gameSystem: string | null): Record<RollMode, string> {
  return MODE_LABELS[gameSystem ?? ''] ?? { normal: 'Normal', advantage: 'Advantage', disadvantage: 'Disadvantage' };
}

function systemSupportsAdvantage(gameSystem: string | null): boolean {
  return gameSystem === 'DND_5E' || gameSystem === 'PATHFINDER_2E';
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
          <Dices className="w-3 h-3 text-moss-green flex-shrink-0" />
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

  const [customExpr, setCustomExpr] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  const rolls: CharacterRolls = useMemo(
    () => buildNpcRolls(token.statBlock ?? null),
    [token.statBlock]
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

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
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
    onRoll(expr, `${token.name}: ${purpose}`);
    onClose();
  };

  const handleCustomRoll = () => {
    const expr = customExpr.trim();
    if (!expr) { setCustomError('Enter a dice expression'); return; }
    if (!isValidDiceExpression(expr)) { setCustomError('Invalid dice expression'); return; }
    const purpose = customLabel.trim()
      ? `${token.name}: ${customLabel.trim()}`
      : `${token.name}: Custom Roll`;
    onRoll(expr, purpose);
    onClose();
  };

  return (
    <div
      ref={pickerRef}
      className="fixed z-[60] bg-soft-cream border-2 border-moss-green/30 rounded-lg shadow-2xl overflow-hidden"
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
      <div className="flex items-center justify-between px-3 py-2 bg-moss-green/10 border-b border-moss-green/20">
        <div className="flex items-center gap-2">
          <Dices className="w-4 h-4 text-moss-green" />
          <span className="text-sm font-semibold text-stone-gray truncate">
            Roll for {token.name}
          </span>
        </div>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-moss-green/10 transition-colors">
          <X className="w-4 h-4 text-warm-gray" />
        </button>
      </div>

      {/* Roll Mode Selector (d20 systems only) */}
      {hasAdvantage && hasAnyRolls && (
        <div className="px-3 py-2 border-b border-moss-green/10 bg-parchment/30">
          <div className="text-xs text-warm-gray mb-1">Roll mode</div>
          <div className="relative">
            <button
              onClick={() => setModeOpen((o) => !o)}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded border border-moss-green/30 bg-paper/60 text-sm text-ink-secondary hover:bg-paper/80 transition-colors"
            >
              <span className={mode !== 'normal' ? 'text-amber-600 font-medium' : ''}>
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
                      mode === m ? 'font-semibold text-moss-green' : 'text-stone-gray'
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
      <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
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
          </div>
        )}
      </div>

      {/* Free-form Custom Roll */}
      <div className="border-t border-moss-green/20 bg-parchment/30 px-3 py-2 space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-wider text-warm-gray">
          Custom Roll
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={customExpr}
            onChange={(e) => { setCustomExpr(e.target.value); setCustomError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomRoll()}
            placeholder="e.g. 2d6+3"
            className="input-cozy flex-1 text-xs py-1"
          />
          <button
            onClick={handleCustomRoll}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-cozy bg-moss-green/10 text-moss-green border border-moss-green/30 hover:bg-moss-green/20 transition-colors"
            title="Roll"
          >
            <Plus className="w-3 h-3" /> Roll
          </button>
        </div>
        <input
          type="text"
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCustomRoll()}
          placeholder="Label (optional, e.g. Fireball Damage)"
          className="input-cozy w-full text-xs py-1"
        />
        {customError && (
          <div className="text-[10px] text-red-600">{customError}</div>
        )}
      </div>
    </div>
  );
}
