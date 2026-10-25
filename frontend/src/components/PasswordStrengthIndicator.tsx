// ============================================
// Password Strength Indicator Component
// Visual feedback for password strength
// Shows color-coded strength level with progress bar
// The sign-up page and the setup wizard both show it
// ============================================

import type { PasswordStrength } from '@/utils/validation';

interface PasswordStrengthIndicatorProps {
  password: string;
  strength: PasswordStrength | null;
  /** For a password field whose aria-describedby names the indicator. */
  id?: string;
  /** Announce each change of strength to a screen reader. */
  'aria-live'?: 'polite';
}

export default function PasswordStrengthIndicator({
  password,
  strength,
  id,
  'aria-live': ariaLive,
}: PasswordStrengthIndicatorProps) {
  if (!password || !strength) {
    return null;
  }

  return (
    <div id={id} className="mt-2" aria-live={ariaLive}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-warm-gray">Password Strength:</span>
        <span
          className={`text-xs font-medium ${
            strength.color === 'green'
              ? 'text-success-ink'
              : strength.color === 'yellow'
              ? 'text-warning-ink'
              : 'text-danger-ink'
          }`}
        >
          {strength.label}
        </span>
      </div>
      <div className="w-full bg-warm-gray/20 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${
            strength.color === 'green'
              ? 'bg-success'
              : strength.color === 'yellow'
              ? 'bg-warning'
              : 'bg-danger'
          }`}
          style={{ width: `${strength.percent}%` }}
        ></div>
      </div>
    </div>
  );
}
