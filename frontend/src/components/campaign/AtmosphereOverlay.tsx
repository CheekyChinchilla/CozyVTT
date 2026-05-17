/**
 * AtmosphereOverlay
 * Per SOW Section 18.2: Visual Atmosphere Effects
 *
 * Renders a CSS particle-effect overlay over the map canvas.
 * Effect names map to classes defined in atmosphere-effects.css.
 * Component is invisible (returns null) when effect is null.
 */

import '@/styles/atmosphere-effects.css';

const EFFECT_CLASS_MAP: Record<string, string> = {
  rain:     'atmosphere-rain',
  mist:     'atmosphere-mist',
  leaves:   'atmosphere-leaves',
  sparkles: 'atmosphere-sparkles',
  snow:     'atmosphere-snow',
  wind:     'atmosphere-wind',
};

interface AtmosphereOverlayProps {
  effect: string | null;
}

export default function AtmosphereOverlay({ effect }: AtmosphereOverlayProps) {
  if (!effect) return null;
  const effectClass = EFFECT_CLASS_MAP[effect];
  if (!effectClass) return null;

  return (
    <div
      className={`atmosphere-overlay ${effectClass}`}
      aria-hidden="true"
    />
  );
}
