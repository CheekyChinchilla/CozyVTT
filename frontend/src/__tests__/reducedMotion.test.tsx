/**
 * The operating system's "reduce motion" setting and the app's animations.
 *
 * App wraps everything in <MotionConfig reducedMotion="user">, so when the
 * setting is on, framer-motion skips movement (transform and layout
 * animations) and jumps straight to the end. These checks hold that behaviour
 * across framer-motion upgrades: with the setting on, a slide lands at once
 * under "user", and the same slide under "never" is still under way.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MotionConfig, motion } from 'framer-motion';

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
