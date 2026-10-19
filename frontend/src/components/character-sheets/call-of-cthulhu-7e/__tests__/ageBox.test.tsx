/**
 * The Age box on the Call of Cthulhu editor's header.
 *
 * The schema stores an age as text, turning a typed number into a string, and
 * also accepts text that is not a number from an import or the API. The box is
 * a number input, which shows such text as blank under its "Age" placeholder.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { cocCharacter } from './cocFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

function ageBox(age: string | number | undefined): HTMLInputElement {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<CallOfCthulhu7eCharacterEditor character={cocCharacter({ age })} onSave={onSave} onCancel={vi.fn()} />);
  return screen.getByPlaceholderText('Age') as HTMLInputElement;
}

describe('the Call of Cthulhu Age box', () => {
  it('shows a stored age', () => {
    expect(ageBox('34').value).toBe('34');
  });

  it('shows 0 for a sheet with no age', () => {
    expect(ageBox(undefined).value).toBe('0');
  });

  it.each(['', 'mid-thirties'])('stays blank for stored text %j that is not a number', (age) => {
    expect(ageBox(age).value).toBe('');
  });
});
