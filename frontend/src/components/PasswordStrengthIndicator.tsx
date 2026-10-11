// ============================================
// Password Strength Indicator Component
// Visual feedback for password strength
// Shows color-coded strength level with progress bar
// ============================================

import type { PasswordStrength } from '@/utils/validation';

interface PasswordStrengthIndicatorProps {
  password: string;
  strength: PasswordStrength | null;
}

export default function PasswordStrengthIndicator({
  password,
  strength,
}: PasswordStrengthIndicatorProps) {
  if (!password || !strength) {
    return null;
  }

  return (
    <div className="mt-2">
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
