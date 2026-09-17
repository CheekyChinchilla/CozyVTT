/**
 * TokenVisionField
 * The one control for a token's darkvision, used wherever a token is edited
 * (the Token Manager when placing, the Quick Editor afterwards), so the
 * label, the hint and the bounds are written once.
 */

export const MAX_SIGHT_RADIUS = 200;

interface TokenVisionFieldProps {
  /** Darkvision in grid squares; 0 = none. */
  value: number;
  onChange: (squares: number) => void;
  disabled?: boolean;
}

export default function TokenVisionField({ value, onChange, disabled }: TokenVisionFieldProps) {
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
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (!Number.isFinite(n)) return;
          onChange(Math.max(0, Math.min(MAX_SIGHT_RADIUS, n)));
        }}
        aria-label="Darkvision in grid squares"
        className="input-cozy input-cozy-number w-full text-sm"
      />
      <p className="text-[10px] text-stone-gray/60 mt-1">
        How far this token makes things out with no light. 0 = none, 12 = 60 ft. Lit things are seen at any distance.
      </p>
    </div>
  );
}
