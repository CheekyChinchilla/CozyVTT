/**
 * TokenVisionField
 * The one control for a token's darkvision, used wherever a token is edited
 * (the Token Manager when placing, the Quick Editor afterwards), so the
 * label, the hint and the bounds are written once.
 *
 * A form that saves later listens to `onChange`, every keystroke. An editor
 * that saves at once listens to `onCommit`, which fires on blur or Enter with
 * the final value, so typing "12" is one save, not one per digit.
 */

import { useEffect, useState } from 'react';

export const MAX_SIGHT_RADIUS = 200;

interface TokenVisionFieldProps {
  /** Darkvision in grid squares; 0 = none. */
  value: number;
  onChange?: (squares: number) => void;
  onCommit?: (squares: number) => void;
  disabled?: boolean;
}

/** A whole number of squares within the bounds, or null for nonsense. */
function squaresFrom(raw: string): number | null {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(MAX_SIGHT_RADIUS, n));
}

export default function TokenVisionField({ value, onChange, onCommit, disabled }: TokenVisionFieldProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = () => {
    const squares = squaresFrom(draft);
    if (squares === null) { setDraft(String(value)); return; }
    setDraft(String(squares));
    if (squares !== value) onCommit?.(squares);
  };

  return (
    <div className="mb-3">
      <label className="text-xs text-stone-gray font-medium block mb-1">
        Darkvision <span className="font-normal opacity-60">(squares)</span>
      </label>
      <input
        type="number"
        min={0}
        max={MAX_SIGHT_RADIUS}
        step={1}
        value={draft}
        disabled={disabled}
        onChange={(e) => {
          setDraft(e.target.value);
          const squares = squaresFrom(e.target.value);
          if (squares !== null) onChange?.(squares);
        }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        aria-label="Darkvision in grid squares"
        className="input-cozy input-cozy-number w-full text-sm"
      />
      <p className="text-[10px] text-stone-gray/60 mt-1">
        How far this token makes things out with no light. 0 = none, 12 = 60 ft. Lit things are seen at any distance.
      </p>
    </div>
  );
}
