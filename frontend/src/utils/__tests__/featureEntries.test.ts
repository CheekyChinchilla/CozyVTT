/**
 * Features and traits as the sheet reads and writes them.
 *
 * The backend copy of this module has the exhaustive suite, including the
 * punctuation cases; a parity test keeps the two files identical. What is
 * checked here is the round trip the editor actually performs — open a sheet,
 * change nothing, save — because that is the path that would silently rewrite
 * every character on an instance if it were wrong.
 */

import { describe, it, expect } from 'vitest';
import { collectSheetFeatures } from '../featureEntries';

/** What the editor writes back, given a sheet as it was loaded. */
function saveRoundTrip(sheet: Record<string, unknown>): Record<string, unknown> {
  const saved: Record<string, unknown> = { ...sheet };
  saved.featuresAndTraits = collectSheetFeatures(saved);
  delete saved.features;
  return saved;
}

describe('opening a sheet and saving it without edits', () => {
  it('preserves a hand-typed list exactly, in order', () => {
    const typed = [
      'NakuDama-Amphibious',
      'NakuDama-Prehensile Tongue',
      'NakuDama-Frog Leap',
      'Aspiring Shadow Warrior',
    ];

    const saved = saveRoundTrip({ featuresAndTraits: typed });

    expect(saved.featuresAndTraits).toEqual(
      typed.map((name) => ({ name, description: '' }))
    );
  });

  it('is stable: saving twice more changes nothing', () => {
    const once = saveRoundTrip({
      featuresAndTraits: ['NakuDama-Frog Leap', 'Aspiring Shadow Warrior'],
    });
    const twice = saveRoundTrip(once);
    const thrice = saveRoundTrip(twice);

    expect(twice).toEqual(once);
    expect(thrice).toEqual(once);
  });

  it('surfaces template features that were stored but never displayed', () => {
    const saved = saveRoundTrip({
      features: [
        { name: 'Second Wind', description: 'Regain 1d10 + your fighter level.' },
        { name: 'Fighting Style: Defense', description: '+1 AC while wearing armor.' },
      ],
    });

    expect(saved.featuresAndTraits).toEqual([
      { name: 'Second Wind', description: 'Regain 1d10 + your fighter level.' },
      { name: 'Fighting Style: Defense', description: '+1 AC while wearing armor.' },
    ]);
  });

  it('drops the orphan field so the same features are not stored twice', () => {
    const saved = saveRoundTrip({
      featuresAndTraits: ['Aspiring Shadow Warrior'],
      features: [{ name: 'Second Wind', description: 'Regain 1d10.' }],
    });

    expect(saved).not.toHaveProperty('features');
    expect((saved.featuresAndTraits as { name: string }[]).map((f) => f.name)).toEqual([
      'Aspiring Shadow Warrior',
      'Second Wind',
    ]);
  });

  it('leaves the rest of the sheet alone', () => {
    const saved = saveRoundTrip({
      characterName: 'Nakudama',
      level: 5,
      featuresAndTraits: ['NakuDama-Frog Leap'],
      additionalFeaturesAndTraits: 'Some longer notes.',
    });

    expect(saved.characterName).toBe('Nakudama');
    expect(saved.level).toBe(5);
    expect(saved.additionalFeaturesAndTraits).toBe('Some longer notes.');
  });

  it('does not invent a feature on a sheet that has none', () => {
    expect(saveRoundTrip({ characterName: 'Nakudama' }).featuresAndTraits).toEqual([]);
  });
});
