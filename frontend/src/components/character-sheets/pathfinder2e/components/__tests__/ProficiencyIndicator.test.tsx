/**
 * The proficiency badge, given a rank the sheet does not have.
 *
 * `proficiencyRank` is optional on a Pathfinder strike — the schema says so —
 * but the badge looked its config up by rank and read `.bgColor` off the
 * result. A strike without one crashed the whole sheet into the error boundary:
 * "Cannot read properties of undefined (reading 'bgColor')".
 *
 * Found when a migration produced strikes from an older shape that never had
 * the field. Any sheet imported, hand-edited, or written by an older version
 * could do the same, so the fix belongs in the badge rather than the migration.
 *
 * A missing rank renders nothing rather than defaulting to Untrained: a
 * Fighter's warhammer is not untrained, and showing a "U" would state something
 * about the character that is not known to be true.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ProficiencyIndicator, { type ProficiencyRank } from '../ProficiencyIndicator';

describe('ProficiencyIndicator', () => {
  it.each(['untrained', 'trained', 'expert', 'master', 'legendary'] as ProficiencyRank[])(
    'renders the %s badge',
    (rank) => {
      const { container } = render(<ProficiencyIndicator rank={rank} />);
      expect(container.textContent).toBe(rank.charAt(0).toUpperCase());
    }
  );

  it('renders nothing when the rank is missing', () => {
    const { container } = render(
      <ProficiencyIndicator rank={undefined as unknown as ProficiencyRank} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a rank it does not recognise', () => {
    const { container } = render(
      <ProficiencyIndicator rank={'legendary+' as unknown as ProficiencyRank} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not throw for any of the shapes a stored sheet can hold', () => {
    for (const rank of [undefined, null, '', 'Trained', 42, {}]) {
      expect(() =>
        render(<ProficiencyIndicator rank={rank as unknown as ProficiencyRank} />)
      ).not.toThrow();
    }
  });
});
