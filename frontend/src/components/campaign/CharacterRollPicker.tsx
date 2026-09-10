/**
 * CharacterRollPicker
 * A small floating modal that lets a player pick a roll from their character sheet
 * via the right-click context menu on the Campaign Roster or a token on the map.
 *
 * Shows: Abilities | Skills | Saving Throws | Combat
 * For d20 systems also shows a roll-mode selector: Normal / Advantage / Disadvantage
 * (labelled Fortune / Misfortune for Pathfinder 2e).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Dices, X, ChevronDown } from 'lucide-react';
import { api } from '@/services/api';
import type { Character } from '@/types';
import {
  getCharacterRolls,
  withAdvantage,
  withDisadvantage,
  type RollOption,
  type CharacterRolls,
} from '@/utils/characterRolls';
import { resolveCharacterInitiative } from '@/utils/rules/initiative';
import CustomRollFooter from './CustomRollFooter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CharacterRollPickerProps {
  /** The character whose rolls to display. Pass the full Character object OR just a characterId string. */
  character?: Character;
  /** If character is not supplied, fetch by ID */
  characterId?: string;
  /**
   * Called with the final dice expression, purpose, and the name of the
   * character the roll is for, when the player clicks a roll button.
   *
   * The name comes from here rather than from each caller because this is the
   * component that already holds the character; three call sites looking it up
   * for themselves is how the roll menu got its ownership check wrong.
   */
  onRoll: (expression: string, purpose: string, characterName?: string) => void;
  /**
   * Roll initiative for the token this picker was opened from, sending the
   * result to the initiative tracker rather than only to the dice log.
   *
   * Omitted when initiative is not on offer — the token is not in the
   * initiative order, or this viewer is not allowed to roll for it — in which
   * case the section is not rendered at all. Whether a roll is permitted is
   * decided by the server; this only controls what is shown.
   */
  onRollInitiative?: () => void;
  onClose: () => void;
  /** Position (from mouse event) — picker will flip if it would overflow viewport */
  anchorX: number;
  anchorY: number;
}

type RollMode = 'normal' | 'advantage' | 'disadvantage';

// ---------------------------------------------------------------------------
// Category section
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  rolls: RollOption[];
  mode: RollMode;
  onRoll: (option: RollOption) => void;
}

const Section: React.FC<SectionProps> = ({ title, rolls, mode: _mode, onRoll }) => {
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
          <Dices className="w-3 h-3 text-brand-ink flex-shrink-0" />
          <span className="flex-1">{opt.label}</span>
        </button>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Roll-mode selector (Normal / Advantage / Disadvantage)
// ---------------------------------------------------------------------------

const MODE_LABELS: Record<string, Record<RollMode, string>> = {
  DND_5E:           { normal: 'Normal', advantage: 'Advantage', disadvantage: 'Disadvantage' },
  PATHFINDER_2E:    { normal: 'Normal', advantage: 'Fortune',   disadvantage: 'Misfortune' },
  CALL_OF_CTHULHU_7E: { normal: 'Normal', advantage: 'Normal', disadvantage: 'Normal' },
};

function getModeLabels(gameSystem: string | null): Record<RollMode, string> {
  return MODE_LABELS[gameSystem ?? ''] ?? { normal: 'Normal', advantage: 'Advantage', disadvantage: 'Disadvantage' };
}

// Does this game system support advantage/disadvantage variants?
function systemSupportsAdvantage(gameSystem: string | null): boolean {
  return gameSystem === 'DND_5E' || gameSystem === 'PATHFINDER_2E';
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CharacterRollPicker({
  character: initialCharacter,
  characterId,
  onRoll,
  onRollInitiative,
  onClose,
  anchorX,
  anchorY,
}: CharacterRollPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const [character, setCharacter] = useState<Character | null>(initialCharacter ?? null);
  const [rolls, setRolls] = useState<CharacterRolls | null>(null);
  const [loading, setLoading] = useState(!initialCharacter);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<RollMode>('normal');
  const [modeOpen, setModeOpen] = useState(false);

  // Fetch character if not provided
  useEffect(() => {
    if (initialCharacter) {
      const extracted = getCharacterRolls(initialCharacter.gameSystem, initialCharacter.data);
      setRolls(extracted);
      setLoading(false);
      return;
    }
    if (!characterId) { setError('No character provided'); setLoading(false); return; }

    api.getCharacter(characterId)
      .then(({ character: c }) => {
        setCharacter(c);
        setRolls(getCharacterRolls(c.gameSystem, c.data));
      })
      .catch(() => setError('Failed to load character data'))
      .finally(() => setLoading(false));
  }, [initialCharacter, characterId]);  

  // Position picker, flipping if needed
  useEffect(() => {
    if (!pickerRef.current) return;
    const rect = pickerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = anchorX + rect.width > vw ? Math.max(0, anchorX - rect.width) : anchorX;
    const y = anchorY + rect.height > vh ? Math.max(0, anchorY - rect.height) : anchorY;
    setPos({ x, y });
  }, [rolls, anchorX, anchorY]);

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
      const modeLabel = getModeLabels(character?.gameSystem ?? null)[mode];
      purpose = `${purpose} (${modeLabel})`;
    }

    onRoll(expr, purpose, character?.name);
    onClose();
  };

  const gameSystem = character?.gameSystem ?? null;
  const hasAdvantage = systemSupportsAdvantage(gameSystem);
  const modeLabels = getModeLabels(gameSystem);

  // What initiative means for this character, purely so the entry can describe
  // itself ("1d20+3", or "DEX 65" for a system that does not roll). The server
  // works the same thing out from the same shared rules when the roll is
  // actually made — this never decides the outcome.
  const initiative = resolveCharacterInitiative(gameSystem, character?.data);

  const characterName = character?.name ?? 'Character';
  const hasAnyRolls = rolls && (
    rolls.abilities.length > 0 ||
    rolls.skills.length > 0 ||
    rolls.savingThrows.length > 0 ||
    rolls.combat.length > 0
  );

  return (
    <div
      ref={pickerRef}
      className="fixed z-[60] bg-soft-cream border-2 border-moss-green/30 rounded-lg shadow-2xl overflow-hidden"
      style={{
        left:       pos ? pos.x : anchorX,
        top:        pos ? pos.y : anchorY,
        visibility: pos ? 'visible' : 'hidden',
        minWidth:   240,
        maxWidth:   300,
        maxHeight:  520,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-moss-green/10 border-b border-moss-green/20">
        <div className="flex items-center gap-2">
          <Dices className="w-4 h-4 text-brand-ink" />
          <span className="text-sm font-semibold text-stone-gray truncate">
            Roll for {characterName}
          </span>
        </div>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-moss-green/10 transition-colors">
          <X className="w-4 h-4 text-warm-gray" />
        </button>
      </div>

      {/* Roll Mode Selector (d20 systems only) */}
      {hasAdvantage && !loading && hasAnyRolls && (
        <div className="px-3 py-2 border-b border-moss-green/10 bg-parchment/30">
          <div className="text-xs text-warm-gray mb-1">Roll mode</div>
          <div className="relative">
            <button
              onClick={() => setModeOpen((o) => !o)}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded border border-moss-green/30 bg-paper/60 text-sm text-ink-secondary hover:bg-paper/80 transition-colors"
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
      <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
        {loading && (
          <div className="flex items-center justify-center py-8 text-warm-gray text-sm">
            Loading rolls…
          </div>
        )}

        {error && (
          <div className="px-3 py-4 text-sm text-danger-ink text-center">{error}</div>
        )}

        {/* Initiative — offered only while this token is in the initiative
            order, and only to someone allowed to roll for it. Kept outside the
            block below so it still shows for a character whose sheet has
            nothing else rollable on it: being in a fight does not depend on
            having filled the sheet in. */}
        {!loading && !error && onRollInitiative && (
          <div className="border-b border-moss-green/10">
            <div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-warm-gray bg-parchment/40">
              Initiative
            </div>
            <button
              onClick={() => { onRollInitiative(); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-stone-gray hover:bg-moss-green/10 transition-colors text-left"
            >
              <Dices className="w-3 h-3 text-brand-ink flex-shrink-0" />
              {/* The wording follows the system. Call of Cthulhu ranks
                  combatants by Dexterity with no die involved, so offering to
                  "roll" would promise something that does not happen. */}
              <span className="flex-1">
                {initiative?.kind === 'fixed' ? 'Set Initiative' : 'Roll Initiative'}
              </span>
              {initiative && (
                <span className="text-xs text-warm-gray flex-shrink-0">{initiative.label}</span>
              )}
            </button>
          </div>
        )}

        {!loading && !error && !hasAnyRolls && (
          <div className="px-3 py-6 text-sm text-warm-gray text-center">
            No rollable stats found for this character.
            <br />
            <span className="text-xs">Make sure the character sheet is filled in.</span>
          </div>
        )}

        {!loading && !error && rolls && (
          <div className="divide-y divide-moss-green/10">
            <Section title="Abilities" rolls={rolls.abilities} mode={mode} onRoll={handleRollOption} />
            <Section title="Skills" rolls={rolls.skills} mode={mode} onRoll={handleRollOption} />
            {rolls.savingThrows.length > 0 && (
              <Section title="Saving Throws" rolls={rolls.savingThrows} mode={mode} onRoll={handleRollOption} />
            )}
            <Section title="Combat" rolls={rolls.combat} mode={mode} onRoll={handleRollOption} />
          </div>
        )}
      </div>

      {/* Not everything a character rolls comes off the sheet. Pinned below the
          list rather than inside it, so it is reachable without scrolling past
          a long skill list — the same place the creature picker keeps it.

          Only shown once the character has loaded: the roll is filed under
          their name, and there is nothing to file it under until then. */}
      {!loading && !error && character && (
        <CustomRollFooter
          onRoll={(expression, purpose) => { onRoll(expression, purpose, character.name); onClose(); }}
        />
      )}
    </div>
  );
}
