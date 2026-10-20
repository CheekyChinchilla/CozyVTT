/**
 * The operating system's "reduce motion" setting and the app's animations.
 *
 * App wraps everything in <MotionConfig reducedMotion="user">, so when the
 * setting is on, framer-motion skips movement (transform and layout
 * animations) and jumps straight to the end. These checks hold that behaviour
 * across framer-motion upgrades: with the setting on, a slide lands at once
 * under "user", and the same slide under "never" is still under way.
 *
 * index.css also shortens CSS animations and transitions under the setting.
 * Transitions must be switched off there (0s), never made very short: when
 * framer-motion ends a fade it writes the final opacity on the element, and
 * a CSS transition of any length then starts from the value the fade began
 * with. Firefox paints that start value for one frame, so a modal or toast
 * that faded in blinks out once, and a step that faded out shows again.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MotionConfig, motion } from 'framer-motion';
import indexCss from '../index.css?raw';
import Modal from '@/components/ui/Modal';
import ToastContainer from '@/components/common/ToastContainer';
import { ToastProvider, useToast } from '@/contexts/ToastContext';

// framer-motion reads the setting once, the first time a component asks for
// it, so it is switched on before anything in this file renders.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

function Slide({ reducedMotion }: { reducedMotion: 'user' | 'never' }) {
  return (
    <MotionConfig reducedMotion={reducedMotion}>
      <motion.div
        data-testid="slide"
        initial={{ x: -100 }}
        animate={{ x: 0 }}
        transition={{ duration: 10, ease: 'linear' }}
      />
    </MotionConfig>
  );
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('MotionConfig reducedMotion="user" with reduce motion turned on', () => {
  it('moves a sliding element straight to where it ends', async () => {
    render(<Slide reducedMotion="user" />);
    await waitFor(() => expect(screen.getByTestId('slide').style.transform).toBe('none'));
  });

  it('still animates the same slide when told to ignore the setting', async () => {
    render(<Slide reducedMotion="never" />);
    await pause(200);
    const transform = screen.getByTestId('slide').style.transform;
    expect(transform).toMatch(/^translateX\(-\d/);
  });
});

describe('index.css with reduce motion turned on', () => {
  const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(indexCss)?.[1] ?? '';

  it('switches CSS transitions off, so a finished fade does not blink', () => {
    expect(block).not.toBe('');
    expect([...block.matchAll(/transition-duration:\s*([^;]+);/g)].map((m) => m[1].trim())).toEqual(['0s !important']);
  });

  it('still shortens CSS animations to a moment, so their end events fire', () => {
    expect(/animation-duration:\s*([^;]+);/.exec(block)?.[1].trim()).toBe('0.001ms !important');
  });
});

// framer-motion makes transforms instant under the setting both ways. On the
// way in that cannot be seen, since the element starts transparent; on the
// way out the element jumped to its exit transform and then faded there.
describe('closing with reduce motion turned on', () => {
  it('fades a dialog where it stands', async () => {
    const view = render(
      <MotionConfig reducedMotion="user">
        <Modal open onClose={() => {}} title="Settings">body</Modal>
      </MotionConfig>
    );
    await waitFor(() => expect(screen.getByRole('dialog').style.opacity).toBe('1'));
    view.rerender(
      <MotionConfig reducedMotion="user">
        <Modal open={false} onClose={() => {}} title="Settings">body</Modal>
      </MotionConfig>
    );
    await act(() => pause(50));

    const dialog = screen.getByRole('dialog');
    expect(dialog.style.transform).toMatch(/^(none)?$/);
  });

  it('fades a notification where it stands', async () => {
    function Show() {
      const { showToast } = useToast();
      return <button type="button" onClick={() => showToast('Saved', 'success', 0)}>Show</button>;
    }
    render(
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <Show />
          <ToastContainer />
        </ToastProvider>
      </MotionConfig>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    const card = (await screen.findByText('Saved')).closest('[role="alert"]')?.parentElement as HTMLElement;
    await waitFor(() => expect(card.style.opacity).toBe('1'));

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    await act(() => pause(50));

    expect(card.isConnected).toBe(true);
    expect(card.style.transform).toMatch(/^(none)?$/);
  });
});
