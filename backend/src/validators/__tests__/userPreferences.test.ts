/**
 * UserPreferences validator tests
 */

import { UserPreferencesSchema, UpdateUserPreferencesSchema } from '../userPreferences';

describe('UserPreferencesSchema', () => {
  test('accepts an empty object (all fields optional)', () => {
    const result = UserPreferencesSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test('accepts a valid theme + font', () => {
    const result = UserPreferencesSchema.safeParse({
      themeId: 'obsidian-night',
      fontId: 'medieval',
    });
    expect(result.success).toBe(true);
  });

  test('accepts the "custom" theme sentinel with valid colors', () => {
    const result = UserPreferencesSchema.safeParse({
      themeId: 'custom',
      customThemeColors: {
        primary: '#7C9A6E',
        accent: '#D4A55A',
        background: '#FAF6EC',
        text: '#3A2E26',
      },
    });
    expect(result.success).toBe(true);
  });

  test('rejects an unknown themeId', () => {
    const result = UserPreferencesSchema.safeParse({ themeId: 'not-a-real-theme' });
    expect(result.success).toBe(false);
  });

  test('rejects an unknown fontId', () => {
    const result = UserPreferencesSchema.safeParse({ fontId: 'comic-sans' });
    expect(result.success).toBe(false);
  });

  test('rejects malformed customThemeColors entry', () => {
    const result = UserPreferencesSchema.safeParse({
      themeId: 'custom',
      customThemeColors: {
        primary: 'not-a-color',
        accent: '#D4A55A',
        background: '#FAF6EC',
        text: '#3A2E26',
      },
    });
    expect(result.success).toBe(false);
  });

  test('strips unknown fields silently', () => {
    const result = UserPreferencesSchema.safeParse({
      themeId: 'cozy-default',
      maliciousField: 'rm -rf /',
      __proto__: { hacked: true },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).maliciousField).toBeUndefined();
    }
  });

  test('allows customThemeColors to be null (clearing it)', () => {
    const result = UserPreferencesSchema.safeParse({
      themeId: 'cozy-default',
      customThemeColors: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('UpdateUserPreferencesSchema', () => {
  test('rejects an empty payload (no-op write)', () => {
    const result = UpdateUserPreferencesSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test('accepts a single-field partial update', () => {
    const result = UpdateUserPreferencesSchema.safeParse({ fontId: 'medieval' });
    expect(result.success).toBe(true);
  });
});
