import { useReducedMotionConfig, type TargetAndTransition } from 'framer-motion';

/**
 * An exit that moves, or only fades when the reader asked for less motion.
 *
 * Under App's `<MotionConfig reducedMotion="user">` framer-motion makes
 * transforms instant both ways. On the way in that cannot be seen, since the
 * element starts transparent; on the way out it jumped to its exit transform
 * and then faded there. Pass the exit as it should look with motion on.
 */
export function useMotionExit(exit: TargetAndTransition): TargetAndTransition {
  return useReducedMotionConfig() ? { opacity: 0 } : exit;
}
