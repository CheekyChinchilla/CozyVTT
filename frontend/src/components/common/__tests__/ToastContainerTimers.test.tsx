/**
 * Each pop-up message leaves after its own time.
 *
 * Every card's timer started again whenever the stack drew itself, because
 * each card was handed a new dismiss function each time. A message that
 * arrived while others were up made them all wait out its time, so messages
 * that came one after another all left together.
 */

import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ToastProvider, useToast } from '@/contexts/ToastContext';
import ToastContainer from '../ToastContainer';

vi.mock('framer-motion', () => {
  const MotionDiv = (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  };
  return {
    useReducedMotionConfig: () => false,
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});

let show: ReturnType<typeof useToast>['showToast'] = () => {};
function Trigger() {
  show = useToast().showToast;
  return null;
}

afterEach(() => {
  vi.useRealTimers();
});

it('takes the first message away after its own time, while a later one stays', () => {
  vi.useFakeTimers();
  render(<ToastProvider><Trigger /><ToastContainer /></ToastProvider>);
  act(() => show('Saved the map', 'success', 5000));
  act(() => { vi.advanceTimersByTime(3000); });
  act(() => show('Token placed', 'success', 5000));
  act(() => { vi.advanceTimersByTime(2100); });

  expect(screen.queryByText('Saved the map')).toBeNull();
  expect(screen.getByText('Token placed')).toBeTruthy();
});
