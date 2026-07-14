/**
 * Join class names, skipping falsy values. Dependency-free stand-in for clsx
 * — the UI primitives only ever need simple conditional joining.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
