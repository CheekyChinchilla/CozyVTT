// ============================================
// ToastContext — Global toast notification system
// Replaces per-page toast state with a single stacking context consumed from anywhere.
// ============================================

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { ToastType } from '@/components/Toast';

// ============================================
// Types
// ============================================

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  /** Auto-dismiss delay in ms; 0 = persist until closed manually */
  duration: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  dismissToast: (id: string) => void;
}

// ============================================
// Context
// ============================================

const ToastContext = createContext<ToastContextValue | null>(null);

// ============================================
// Provider
// ============================================

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((
    message: string,
    type: ToastType = 'info',
    duration = 5000
  ) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

/**
 * Returns the global toast API.
 *
 * @example
 * const { showToast } = useToast();
 * showToast('Campaign created!', 'success');
 * showToast('Something went wrong', 'error');
 */
export function useToast(): Pick<ToastContextValue, 'showToast'> {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return { showToast: ctx.showToast };
}

/** Internal hook used only by ToastContainer */
export function useToastStack(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToastStack must be used inside <ToastProvider>');
  }
  return ctx;
}
