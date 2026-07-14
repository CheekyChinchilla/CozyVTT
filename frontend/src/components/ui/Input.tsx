// ============================================
// Input / Textarea / Select — shared form control primitives
//
// All three emit the `.input-cozy` style (theme-token driven) plus the
// standard disabled treatment, so migrating raw `className="input-cozy …"`
// elements is visually a no-op. Pair with <Field> for label + hint + error.
// ============================================

import { forwardRef } from 'react';
import { cn } from '@/utils/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Marks the control invalid (red ring) — set automatically inside <Field error>. */
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'input-cozy w-full disabled:opacity-50 disabled:cursor-not-allowed',
        invalid && 'ring-2 ring-danger/60 border-transparent',
        className
      )}
      {...rest}
    />
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'input-cozy w-full resize-none disabled:opacity-50 disabled:cursor-not-allowed',
        invalid && 'ring-2 ring-danger/60 border-transparent',
        className
      )}
      {...rest}
    />
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...rest },
  ref
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'input-cozy w-full disabled:opacity-50 disabled:cursor-not-allowed',
        invalid && 'ring-2 ring-danger/60 border-transparent',
        className
      )}
      {...rest}
    >
      {children}
    </select>
  );
});
