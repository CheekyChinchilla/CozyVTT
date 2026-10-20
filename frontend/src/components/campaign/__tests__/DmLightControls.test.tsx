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
import userEvent from '@testing-library/user-event';
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

// The colour box refused every value but a complete colour, so each key
// typed into it was undone at once and nothing could be typed there.
describe('the light colour box', () => {
  function renderColour() {
    const onDefaultsChange = vi.fn();
    render(
      <DmLightControls
        lightMode="light-place"
        onLightModeChange={vi.fn()}
        lightCount={0}
        onClearAll={vi.fn()}
        onDefaultsChange={onDefaultsChange}
        placementDefaults={{ brightRadius: 4, dimRadius: 8, color: '#ffcc66' }}
      />
    );
    fireEvent.click(screen.getByText(/^Lights/));
    return { onDefaultsChange, box: screen.getByPlaceholderText('#ffcc66') as HTMLInputElement };
  }

  it('takes a colour typed one key at a time', async () => {
    const { onDefaultsChange, box } = renderColour();
    await userEvent.clear(box);
    await userEvent.type(box, '#FF9933');
    expect(box.value).toBe('#FF9933');
    expect(onDefaultsChange).toHaveBeenLastCalledWith({ brightRadius: 4, dimRadius: 8, color: '#ff9933' });
  });

  it('takes a colour typed without the #', async () => {
    const { onDefaultsChange, box } = renderColour();
    await userEvent.clear(box);
    await userEvent.type(box, '66aaff');
    expect(onDefaultsChange).toHaveBeenLastCalledWith({ brightRadius: 4, dimRadius: 8, color: '#66aaff' });
  });

  it('goes back to the colour in use when left unfinished', async () => {
    const { onDefaultsChange, box } = renderColour();
    await userEvent.clear(box);
    await userEvent.type(box, '#ff9');
    expect(box.value).toBe('#ff9');
    fireEvent.blur(box);
    expect(box.value).toBe('#ffcc66');
    expect(onDefaultsChange).not.toHaveBeenCalled();
  });
});

// The title that folds the panel was a clickable box, out of reach of Tab and
// silent about whether the panel was open.
describe('the Lights title', () => {
  it('is a button that says whether the panel is open, and folds it', () => {
    render(<DmLightControls lightMode={null} onLightModeChange={vi.fn()} lightCount={2} onClearAll={vi.fn()} lightingEnabled />);
    // A space between the word and the count, which read as "Lights(2)".
    const title = screen.getByRole('button', { name: 'Lights (2)' });
    expect(title).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(title);

    expect(title).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(title.getAttribute('aria-controls') ?? '')).not.toBeNull();
  });
});

