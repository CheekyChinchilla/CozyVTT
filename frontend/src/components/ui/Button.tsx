// ============================================
// Button — the shared button primitive
//
// Variants map 1:1 onto the cozy button styles that previously lived as
// `.btn-*` classes in index.css, so migrating `<button className="btn-primary">`
// to `<Button>` is visually a no-op. Extra classes passed via `className`
// are appended verbatim.
//
// `loading` renders the standard spinner and disables the button — new code
// should prefer it over hand-rolling `<Loader2 className="animate-spin"/>`.
// ============================================

import { forwardRef } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Default 'primary'. */
  variant?: ButtonVariant;
  /** 'md' is the natural size baked into the variant styles. */
  size?: ButtonSize;
  /** Shows the standard spinner and disables the button. */
  loading?: boolean;
  /** Optional leading lucide icon. Hidden while `loading` shows the spinner. */
  icon?: LucideIcon;
  /** Square icon-only button — requires `aria-label`. */
  iconOnly?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  // Ghost is new with this component — quiet toolbar/inline actions.
  // Theme tokens only, so it follows all 28 themes.
  ghost:
    'bg-transparent text-ink px-4 py-2 rounded-cozy font-medium ' +
    'hover:bg-surface transition-colors duration-200 ' +
    'focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'text-sm !px-3 !py-1.5',
  md: '', // natural padding from the variant styles
  lg: 'text-lg !px-6 !py-3',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon: Icon,
    iconOnly = false,
    className,
    children,
    disabled,
    ...rest
  },
  ref
) {
  if (import.meta.env.DEV && iconOnly && !rest['aria-label'] && !rest['aria-labelledby']) {
    console.warn('[Button] iconOnly buttons need an aria-label for screen readers.');
  }

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        iconOnly && '!p-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className={cn('w-4 h-4 animate-spin inline-block', !iconOnly && 'mr-2')} aria-hidden="true" />
      ) : Icon ? (
        <Icon className={cn('w-4 h-4 inline-block', !iconOnly && 'mr-2')} aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
});

export default Button;
