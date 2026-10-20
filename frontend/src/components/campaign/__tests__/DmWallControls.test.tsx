/**
 * The Walls panel's title, which folds and unfolds the panel.
 *
 * It was a clickable box, out of reach of Tab and silent about whether the
 * panel was open.
 */

import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DmWallControls from '../DmWallControls';

it('is a button that says whether the panel is open, and folds it', () => {
  const onCollapse = vi.fn();
  render(
    <DmWallControls
      wallMode={null}
      onWallModeChange={vi.fn()}
      onCollapse={onCollapse}
      wallType="wall"
      onWallTypeChange={vi.fn()}
      snapToGrid
      onSnapToGridChange={vi.fn()}
      snapToEndpoint
      onSnapToEndpointChange={vi.fn()}
      wallCount={3}
      onClearAll={vi.fn()}
      wallColor="#f97316"
      onWallColorChange={vi.fn()}
    />
  );
  // A space between the word and the count, which read as "Walls(3)".
  const title = screen.getByRole('button', { name: 'Walls (3)' });
  expect(title).toHaveAttribute('aria-expanded', 'false');

  fireEvent.click(title);
  expect(title).toHaveAttribute('aria-expanded', 'true');
  expect(document.getElementById(title.getAttribute('aria-controls') ?? '')).not.toBeNull();

  fireEvent.click(title);
  expect(title).toHaveAttribute('aria-expanded', 'false');
  expect(onCollapse).toHaveBeenCalledTimes(1);
});
