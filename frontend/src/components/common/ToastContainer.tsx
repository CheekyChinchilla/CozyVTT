// ============================================
// ToastContainer — renders the stacked toast queue
// Consumes ToastContext to display multiple simultaneous notifications.
// ============================================

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useToastStack } from '@/contexts/ToastContext';
import type { ToastItem } from '@/contexts/ToastContext';

// ============================================
// Individual Toast Card
// ============================================

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  // Auto-dismiss timer. `onDismiss` is the provider's stable dismissToast, so
  // the timer runs once from when the card appears: a fresh function on each
  // draw restarted every card's timer whenever another message arrived.
  useEffect(() => {
    if (toast.duration <= 0) return;
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const { icon, styles } = getToastAppearance(toast.type);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.9 }}
      transition={{ duration: 0.2 }}
    >
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className={`glass-panel border-2 ${styles} shadow-lg rounded-lg p-4 flex items-start gap-3 min-w-[280px] max-w-sm`}
      >
        <div className="shrink-0 mt-0.5" aria-hidden="true">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium wrap-break-word">{toast.message}</p>
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 ml-2 hover:opacity-70 transition-opacity focus:outline-hidden focus:ring-2 focus:ring-current rounded-sm"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );
}

// ============================================
// Appearance helpers
// ============================================

function getToastAppearance(type: ToastItem['type']) {
  switch (type) {
    case 'success':
      return {
        icon: <CheckCircle className="w-5 h-5 text-success-ink" />,
        styles: 'bg-success/10 border-success/30 text-success-ink',
      };
    case 'error':
      return {
        icon: <AlertCircle className="w-5 h-5 text-danger-ink" />,
        styles: 'bg-danger/10 border-danger/30 text-danger-ink',
      };
    case 'warning':
      return {
        icon: <AlertTriangle className="w-5 h-5 text-warning-ink" />,
        styles: 'bg-warning/10 border-warning/30 text-warning-ink',
      };
    default:
      return {
        icon: <Info className="w-5 h-5 text-info-ink" />,
        styles: 'bg-info/10 border-info/30 text-info-ink',
      };
  }
}

// ============================================
// Container
// ============================================

export default function ToastContainer() {
  const { toasts, dismissToast } = useToastStack();

  return (
    <div
      aria-label="Notifications"
      className="fixed top-4 right-4 z-9998 flex flex-col gap-2 pointer-events-none"
    >
      <AnimatePresence mode="sync">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastCard toast={toast} onDismiss={dismissToast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
