/**
 * The fog panel's per-map switch.
 *
 * Fog used to be permanently on for every map. The panel now carries the
 * switch: on, it offers the reveal and hide tools; off, it says so and offers
 * nothing that would change what players see. Turning it off also puts an
 * armed tool down, for the same reason folding the panel does.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DmFogControls, { type FogToolMode } from '../DmFogControls';

function renderPanel(over: Partial<{ fogMode: FogToolMode; fogEnabled: boolean }> = {}) {
  const props = {
    fogMode: null as FogToolMode,
    onFogModeChange: vi.fn(),
    onRevealAll: vi.fn(),
    onHideAll: vi.fn(),
    fogEnabled: true,
    onFogEnabledChange: vi.fn(),
    ...over,
  };
  render(<DmFogControls {...props} />);
  fireEvent.click(screen.getByText('Fog of War')); // the panel starts folded
  return props;
}

describe('DmFogControls', () => {
  it('offers the reveal and hide tools while fog is on', () => {
    renderPanel();
    expect(screen.getByLabelText('Fog reveal box')).toBeTruthy();
    expect(screen.getByLabelText('Reveal entire map')).toBeTruthy();
    expect((screen.getByLabelText('Fog of war on this map') as HTMLInputElement).checked).toBe(true);
  });

  it('replaces the tools with an explanation while fog is off', () => {
    renderPanel({ fogEnabled: false });
    expect(screen.queryByLabelText('Fog reveal box')).toBeNull();
    expect(screen.queryByLabelText('Reveal entire map')).toBeNull();
    expect(screen.getByText(/Fog is off/)).toBeTruthy();
    expect((screen.getByLabelText('Fog of war on this map') as HTMLInputElement).checked).toBe(false);
  });

  it('turning fog off puts an armed tool down and reports the change', () => {
    const props = renderPanel({ fogMode: 'fog-reveal' });
    fireEvent.click(screen.getByLabelText('Fog of war on this map'));
    expect(props.onFogModeChange).toHaveBeenCalledWith(null);
    expect(props.onFogEnabledChange).toHaveBeenCalledWith(false);
  });

  it('turning fog on reports the change and leaves the tool alone', () => {
    const props = renderPanel({ fogEnabled: false });
    fireEvent.click(screen.getByLabelText('Fog of war on this map'));
    expect(props.onFogEnabledChange).toHaveBeenCalledWith(true);
    expect(props.onFogModeChange).not.toHaveBeenCalled();
  });
});
