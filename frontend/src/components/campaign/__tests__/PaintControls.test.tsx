/**
 * Paint's panel on a computer. Its Save sat at the panel's foot, under every
 * tool's settings, in a column that scrolls: out of sight on a short screen,
 * and easy to miss when in sight. Save and Done are in the panel's header,
 * as the phone's strip has them.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import PaintControls, { type PaintControlsProps } from '../PaintControls';
import { DEFAULT_PAINT_SETTINGS } from '../map/paint/usePaintSurface';

function panel(extra: Partial<PaintControlsProps> = {}) {
  const props: PaintControlsProps = {
    settings: DEFAULT_PAINT_SETTINGS, onSettingsChange: vi.fn(), canUndo: true, canRedo: false,
    onUndo: vi.fn(), onRedo: vi.fn(), unsaved: true, onSave: vi.fn(), saving: false, onDownload: vi.fn(), onClose: vi.fn(),
    ...extra,
  };
  render(<PaintControls {...props} />);
  return props;
}

const header = () => within(screen.getByRole('region', { name: 'Paint' })).getByRole('heading', { name: 'Paint' }).parentElement!;

describe("Paint's panel", () => {
  it('puts Save and Done in its header, before any tool', () => {
    const props = panel();
    const save = within(header()).getByRole('button', { name: 'Save' });
    const done = within(header()).getByRole('button', { name: 'Done painting' });
    expect(done).toHaveTextContent('Done');
    const buttons = within(screen.getByRole('region', { name: 'Paint' })).getAllByRole('button');
    expect(buttons.indexOf(save)).toBeLessThan(buttons.indexOf(screen.getByRole('button', { name: 'Brush' })));
    fireEvent.click(save);
    expect(props.onSave).toHaveBeenCalled();
    fireEvent.click(done);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('has one Save, offered only with paint not saved', () => {
    panel({ unsaved: false });
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('says Saving… while a save is under way', () => {
    panel({ saving: true });
    expect(within(header()).getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});
