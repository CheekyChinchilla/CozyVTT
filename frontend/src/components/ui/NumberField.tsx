import { useEffect, useState } from 'react';

/**
 * A number input you can actually clear and retype.
 *
 * The sheets used to write `parseInt(e.target.value) || <default>` straight into
 * form state, which makes an empty box unrepresentable: deleting the contents
 * snapped the field to its default, and the next keystroke appended to *that*.
 * Selecting "10" and typing "18" gave you something other than 18, which is why
 * players described the ability scores as unusable.
 *
 * The fix is to keep the box's text separate from the committed number while it
 * is being edited. An empty box stays empty, a value is committed as soon as it
 * parses, and range correction happens on blur rather than on every keystroke —
 * clamping mid-type is what turns "1" on the way to "18" into "10".
 *
 * Styling is entirely the caller's: these inputs sit on a coloured sheet header
 * in some places and a white panel in others, so the component takes `className`
 * and adds nothing of its own.
 */
interface NumberFieldProps {
  value: number | undefined | null;
  onChange: (value: number) => void;
  /** Applied on blur, not per keystroke. */
  min?: number;
  max?: number;
  /** Passed straight through; decimals parse fine, e.g. item weights. */
  step?: string | number;
  /**
   * Whole numbers only, which is the default because nearly every field on a
   * sheet is one and the backend schemas declare them `z.number().int()`.
   * Committing a float would fail validation and take every other edit in that
   * save down with it, so decimals are truncated the way the `parseInt` these
   * call sites used to do already did. Set false for genuinely fractional
   * fields such as item weight.
   */
  integer?: boolean;
  /** Committed when the field is left empty or unparseable. Defaults to `min ?? 0`. */
  fallback?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  title?: string;
}

export default function NumberField({
  value,
  onChange,
  min,
  max,
  step,
  integer = true,
  fallback,
  className,
  placeholder,
  disabled,
  id,
  'aria-label': ariaLabel,
  title,
}: NumberFieldProps) {
  // What the box shows. Tracks `value` except while the user is mid-edit, which
  // is the whole point — "" and "-" are valid things to be typing and neither is
  // a number yet.
  const [text, setText] = useState<string>(value == null ? '' : String(value));

  // Follow the value when it changes from outside (a recalculation, a reset, or
  // switching to a different character), without fighting the user's typing.
  useEffect(() => {
    const asNumber = text === '' ? null : Number(text);
    if (asNumber !== value) {
      setText(value == null ? '' : String(value));
    }
    // Deliberately keyed on `value` only: reacting to `text` here would undo
    // each keystroke as it is typed.
  }, [value]);

  const resolvedFallback = fallback ?? min ?? 0;

  const handleChange = (next: string) => {
    setText(next);

    // Commit as soon as it is a number, so downstream derived values (modifiers,
    // totals) keep up as you type. Leave the box alone if it is not — an empty
    // field is a legitimate intermediate state, not a reason to substitute a
    // default.
    if (next === '' || next === '-') return;
    const parsed = Number(next);
    if (Number.isFinite(parsed)) {
      onChange(integer ? Math.trunc(parsed) : parsed);
    }
  };

  const handleBlur = () => {
    // Now that editing has finished, settle on something valid. A value that
    // is already the committed one is not reported again: focus passing
    // through a box is not an edit.
    if (text === '' || text === '-' || !Number.isFinite(Number(text))) {
      setText(String(resolvedFallback));
      if (resolvedFallback !== value) onChange(resolvedFallback);
      return;
    }

    let settled = Number(text);
    if (integer) settled = Math.trunc(settled);
    if (min !== undefined && settled < min) settled = min;
    if (max !== undefined && settled > max) settled = max;

    setText(String(settled));
    if (settled !== value) onChange(settled);
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      id={id}
      aria-label={ariaLabel}
      title={title}
      value={text}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      className={className}
    />
  );
}
