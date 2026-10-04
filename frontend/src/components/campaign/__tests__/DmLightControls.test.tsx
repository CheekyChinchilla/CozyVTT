/**
 * The Lights panel's Global Illumination switch and its warning.
 *
 * With lighting on, Global Illumination off and no lights placed, players
 * see only their darkvision, which for most tokens is nothing. The panel
 * says so, because a DM who has just untied the setting from "see
 * everything" needs to know why the map went dark for the table.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DmLightControls from '../DmLightControls';

function renderPanel(over: Partial<{ lightCount: number; lightingEnabled: boolean; globalIllumination: boolean }> = {}) {
  const onGlobalIlluminationChange = vi.fn();
  render(
    <DmLightControls
      lightMode={null}
      onLightModeChange={vi.fn()}
      lightCount={0}
      onClearAll={vi.fn()}
      lightingEnabled
      globalIllumination={false}
      onGlobalIlluminationChange={onGlobalIlluminationChange}
      {...over}
    />
  );
  fireEvent.click(screen.getByText(/^Lights/)); // the panel starts folded
  return { onGlobalIlluminationChange };
}

const WARNING = /No lights placed and Global Illumination is off/;

describe('DmLightControls', () => {
  it('warns when lighting is on, Global Illumination is off and there are no lights', () => {
    renderPanel();
    expect(screen.getByText(WARNING)).toBeTruthy();
  });

  it('does not warn once a light is placed', () => {
    renderPanel({ lightCount: 1 });
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it('does not warn under Global Illumination', () => {
    renderPanel({ globalIllumination: true });
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it('does not warn while dynamic lighting is off, and disables the switch', () => {
    renderPanel({ lightingEnabled: false });
    expect(screen.queryByText(WARNING)).toBeNull();
    expect((screen.getByLabelText('Global illumination') as HTMLInputElement).disabled).toBe(true);
  });

  it('reports the switch being ticked', () => {
    const { onGlobalIlluminationChange } = renderPanel();
    fireEvent.click(screen.getByLabelText('Global illumination'));
    expect(onGlobalIlluminationChange).toHaveBeenCalledWith(true);
  });
});
