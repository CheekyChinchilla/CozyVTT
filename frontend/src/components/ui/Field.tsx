// ============================================
// Field — label + control + hint/error wrapper
//
// Encodes the accessible form-row pattern the better modals already used
// by hand: <label htmlFor>, aria-describedby wiring, required marker with
// sr-only text, hint line, and a role="alert" error line using the danger
// token (not raw red/spirit-red).
//
// Usage:
//   <Field label="Campaign Name" required hint="2-100 characters" error={error}>
//     {(props) => <Input {...props} value={name} onChange={…} />}
//   </Field>
// ============================================

import { useId } from 'react';
import { cn } from '@/utils/cn';

/** Props injected into the child control so label/hint/error wire up correctly. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
  invalid?: boolean;
}

export interface FieldProps {
  label: string;
  /** Appends the * marker and aria-required. */
  required?: boolean;
  /** Muted helper line under the control. */
  hint?: string;
  /** Error line (role="alert"); also flags the control invalid. */
  error?: string | null;
  className?: string;
  children: (controlProps: FieldControlProps) => React.ReactNode;
}

export default function Field({ label, required, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink mb-2">
        {label}
        {required && (
          <>
            <span className="text-danger" aria-hidden="true"> *</span>
            <span className="sr-only">(required)</span>
          </>
        )}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
        invalid: !!error || undefined,
      })}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-danger font-medium">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className={cn('mt-1 text-xs text-ink-muted', error && 'mt-0.5')}>
          {hint}
        </p>
      )}
    </div>
  );
}
