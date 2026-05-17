// ============================================
// Password Strength Indicator Component
// Visual feedback for password strength
// Shows color-coded strength level with progress bar
// ============================================

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

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
              ? 'text-green-600'
              : strength.color === 'yellow'
              ? 'text-yellow-600'
              : 'text-red-600'
          }`}
        >
          {strength.label}
        </span>
      </div>
      <div className="w-full bg-warm-gray/20 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${
            strength.color === 'green'
              ? 'bg-green-600'
              : strength.color === 'yellow'
              ? 'bg-yellow-600'
              : 'bg-red-600'
          }`}
          style={{ width: `${(strength.score / 10) * 100}%` }}
        ></div>
      </div>
    </div>
  );
}
