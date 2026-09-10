import { useState, KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import { isValidDiceExpression } from '@/utils/characterRolls';

interface CustomRollFooterProps {
  /**
   * Called with a validated expression and the label to file the roll under.
   *
   * The caller decides *who* the roll is for — a token's name, a character's —
   * so this stays the same control in both pickers.
   */
  onRoll: (expression: string, purpose: string) => void;
}

/**
 * A free-form roll, pinned below whatever list a picker is showing.
 *
 * Not everything a table rolls comes off a sheet or a stat block: a falling
 * rock, a DM's improvised save, a homebrew effect. The creature picker had
 * this and the character picker did not, so a player's only route was the
 * dice panel on another tab — which files the roll under their own name
 * rather than their character's.
 */
export default function CustomRollFooter({ onRoll }: CustomRollFooterProps) {
  const [expression, setExpression] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const expr = expression.trim();
    if (!expr) { setError('Enter a dice expression'); return; }
    if (!isValidDiceExpression(expr)) { setError('Invalid dice expression'); return; }
    onRoll(expr, label.trim() || 'Custom Roll');
  };

  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit();
  };

  return (
    <div className="flex-shrink-0 border-t border-moss-green/20 bg-parchment/30 px-3 py-2 space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wider text-warm-gray">
        Custom Roll
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={expression}
          onChange={(e) => { setExpression(e.target.value); setError(null); }}
          onKeyDown={onEnter}
          placeholder="e.g. 2d6+3"
          className="input-cozy flex-1 text-xs py-1"
        />
        <button
          onClick={submit}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-cozy bg-moss-green/10 text-brand-ink border border-moss-green/30 hover:bg-moss-green/20 transition-colors"
          title="Roll"
        >
          <Plus className="w-3 h-3" /> Roll
        </button>
      </div>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={onEnter}
        placeholder="Label (optional, e.g. Fireball Damage)"
        className="input-cozy w-full text-xs py-1"
      />
      {error && <div className="text-[10px] text-danger-ink">{error}</div>}
    </div>
  );
}
