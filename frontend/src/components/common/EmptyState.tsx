// ============================================
// EmptyState — the cozy "nothing here yet" panel
//
// A single source of truth for page-level empty states so every surface
// greets the user with the themed mascot and the same warm framing instead
// of an ad-hoc icon + copy re-typed per page. Pass an `action` (usually a
// <Button>) for the primary next step. Falls back to a custom `icon` when a
// surface wants something other than the mascot (e.g. a search "no results").
// ============================================

import { useTheme } from '@/contexts/ThemeContext';

export interface EmptyStateProps {
  /** Headline, e.g. "No characters yet". */
  title: string;
  /** One or two sentences of gentle guidance. */
  description?: string;
  /** Primary call-to-action, typically a <Button>. */
  action?: React.ReactNode;
  /** Override the mascot with a custom node (e.g. a lucide icon for search results). */
  icon?: React.ReactNode;
  /** Extra classes for the outer panel. */
  className?: string;
}

export default function EmptyState({ title, description, action, icon, className = '' }: EmptyStateProps) {
  const { mascotUrl } = useTheme();

  return (
    <div className={`glass-panel p-12 text-center ${className}`}>
      <div className="max-w-md mx-auto">
        <div className="mb-4 inline-block p-4 rounded-full bg-moss-green/10">
          {icon ?? (
            <img src={mascotUrl} alt="" className="w-12 h-12 object-contain animate-pulse-soft" />
          )}
        </div>
        <h3 className="text-xl font-semibold text-brand-ink mb-2">{title}</h3>
        {description && <p className="text-warm-gray mb-6">{description}</p>}
        {action}
      </div>
    </div>
  );
}
