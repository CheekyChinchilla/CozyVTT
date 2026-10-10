/**
 * The DM tool panels keep one width whichever section is open.
 *
 * The stack had no width of its own and grew to its widest content, so the
 * Fog of War section's notes, which did not wrap, stretched it from 200 to
 * almost 400 pixels while Walls and Lights kept it at 200. The width itself
 * can only be measured in a browser; this pins the rule that sets it.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { createRef } from 'react';
import DmToolPanelContainer from '../DmToolPanelContainer';

describe('DmToolPanelContainer', () => {
  it('gives the panel stack one fixed width, so long notes wrap', () => {
    const { container } = render(
      <DmToolPanelContainer containerRef={createRef<HTMLDivElement>()}>
        <p>Forgets what every player has seen of this map. Their view now is unchanged.</p>
      </DmToolPanelContainer>
    );
    expect(container.firstElementChild?.className).toMatch(/(^|\s)w-\[200px\](\s|$)/);
  });
});
