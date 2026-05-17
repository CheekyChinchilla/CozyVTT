// ============================================
// LoadingOverlay
// Semi-transparent overlay with spinner
// Use for file uploads and long async operations
// ============================================

import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  /** Whether the overlay is visible */
  show: boolean;
  /** Optional status message shown below the spinner */
  message?: string;
  /** When true, covers the nearest positioned ancestor; otherwise covers the full viewport */
  contained?: boolean;
}

export default function LoadingOverlay({ show, message, contained = false }: LoadingOverlayProps) {
  if (!show) return null;

  return (
    <div
      className={`${
        contained ? 'absolute' : 'fixed'
      } inset-0 z-50 flex flex-col items-center justify-center
        bg-paper-white/80 backdrop-blur-sm`}
    >
      <div
        role="status"
        aria-live="polite"
        aria-label={message || 'Loading'}
        className="glass-panel px-8 py-6 flex flex-col items-center gap-4 shadow-xl"
      >
        <Loader2 className="w-8 h-8 text-moss-green animate-spin" aria-hidden="true" />
        {message ? (
          <p className="text-sm font-medium text-stone-gray text-center max-w-xs">
            {message}
          </p>
        ) : (
          <span className="sr-only">Loading</span>
        )}
      </div>
    </div>
  );
}

// ============================================
// UploadProgressBar — inline progress for file uploads
// ============================================

interface UploadProgressBarProps {
  /** 0–100 */
  progress: number;
  /** Optional label shown above the bar */
  label?: string;
}

export function UploadProgressBar({ progress, label }: UploadProgressBarProps) {
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <div className="flex items-center justify-between text-xs text-stone-gray">
          <span>{label}</span>
          <span className="font-medium">{Math.round(progress)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Upload progress'}
        className="h-2 w-full bg-moss-green/10 rounded-full overflow-hidden"
      >
        <div
          className="h-full bg-gradient-to-r from-moss-green to-moss-green/70 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
}
