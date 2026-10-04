/**
 * The read-only feat list shows the text the editor writes under a feat, as
 * well as the `notes` the built-in templates carry.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FeatsList from '../FeatsList';

describe('FeatsList', () => {
  it('shows a description typed in the editor', () => {
    render(
      <FeatsList
        feats={{ class: [{ name: 'Power Attack', level: 1, notes: '', description: 'Two actions, one extra die.' }] }}
      />
    );
    expect(screen.getByText('Two actions, one extra die.')).toBeTruthy();
  });

  it('still shows the notes a template wrote', () => {
    render(<FeatsList feats={{ ancestryAndHeritage: [{ name: 'Darkvision', level: 1, notes: 'See in the dark.' }] }} />);
    expect(screen.getByText('See in the dark.')).toBeTruthy();
  });
});
