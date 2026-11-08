// ============================================
// Toast Notification Component
// Displays temporary notification messages
// Auto-dismisses after timeout
// ============================================

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMotionExit } from '@/utils/motion';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

/** Each kind of message's solid colours (index.css), for this toast and ToastContainer's. */
export const TOAST_TONE: Record<ToastType, string> = {
  success: 'toast-success',
  error: 'toast-danger',
  warning: 'toast-warning',
  info: 'toast-info',
};

export interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
  show: boolean;
}

export default function Toast({
  message,
  type = 'info',
  duration = 5000,
  onClose,
  show,
}: ToastProps) {
  // The latest close function, so the timer runs from when the toast shows
  // and not from the last time its page drew: a page that hands over a new
  // function each draw kept restarting it.
  const closeLatest = useRef(onClose);
  const toastExit = useMotionExit({ opacity: 0, scale: 0.95 });
  useEffect(() => {
    closeLatest.current = onClose;
  });

  useEffect(() => {
    if (show && duration > 0) {
      const timer = setTimeout(() => {
        closeLatest.current();
      }, duration);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [show, duration]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
      case 'error':
        return <AlertCircle className="w-5 h-5" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />;
      case 'info':
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={toastExit}
          transition={{ duration: 0.2 }}
          // Above dialogs and side panels, which render at the end of <body>,
          // as ToastContainer's notifications are. At most 448 px wide, and
          // 16 px inside both edges of a screen too narrow for that, such as
          // a phone's.
          className="fixed top-4 right-4 z-9998 max-w-[min(28rem,calc(100vw-2rem))]"
        >
          <div
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            className={`border-2 ${TOAST_TONE[type]} shadow-lg rounded-lg p-4 flex items-start gap-3`}
          >
            <div className="shrink-0 mt-0.5">{getIcon()}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium wrap-break-word">{message}</p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 ml-2 touch-target inline-flex items-center justify-center hover:opacity-70 transition-opacity"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================
// Toast Hook for Easy Usage
// ============================================

import { useState, useCallback } from 'react';

export interface ToastState {
  show: boolean;
  message: string;
  type: ToastType;
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>({
    show: false,
    message: '',
    type: 'info',
  });

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ show: true, message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, show: false }));
  }, []);

  return {
    toast,
    showToast,
    hideToast,
  };
}
