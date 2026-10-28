/**
 * Each pop-up message leaves after its own time.
 *
 * Every card's timer started again whenever the stack drew itself, because
 * each card was handed a new dismiss function each time. A message that
 * arrived while others were up made them all wait out its time, so messages
 * that came one after another all left together.
 *
 * A card's close button is big enough for a finger on a touch screen.
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

// The close button was the 16-pixel cross alone. jsdom cannot show a touch
// screen's size, so the classes are what is checked.
it('gives a card a close button big enough for a finger, with its cross in the middle', () => {
  render(<ToastProvider><Trigger /><ToastContainer /></ToastProvider>);
  act(() => show('Saved the map', 'success', 5000));

  expect(screen.getByRole('button', { name: 'Dismiss notification' }).className.split(/\s+/))
    .toEqual(expect.arrayContaining(['touch-target', 'inline-flex', 'items-center', 'justify-center']));
});

// Placed 16 px from the right, the stack was as wide as the screen left it, so
// a long message met a phone's left edge. jsdom does no layout, so the class
// that keeps it 16 px from both edges is what is checked.
it('keeps the stack 16 px from both edges of a narrow screen', () => {
  render(<ToastProvider><Trigger /><ToastContainer /></ToastProvider>);
  act(() => show('Saved the map', 'success', 5000));

  expect(screen.getByLabelText('Notifications').className.split(/\s+/))
    .toEqual(expect.arrayContaining(['fixed', 'right-4', 'max-w-[calc(100vw-2rem)]']));
});
