/**
 * ThemeSyncBridge
 *
 * Bridges AuthContext → ThemeContext. Sits inside <AuthProvider> (so it can
 * consume auth state) and inside <ThemeProvider> (so it can drive theme
 * application). Renders nothing.
 *
 * On login: applies the user's stored preferences as a theme overlay.
 * On logout: clears the overlay so the public/login page reverts to the
 *            admin's default theme. Also clears the localStorage cache so
 *            the next anonymous load paints the system theme directly.
 *
 * This pattern (vs. having ThemeProvider call useAuth directly) avoids a
 * circular provider dependency — ThemeProvider currently wraps AuthProvider
 * because the auth check fires after theme is mounted.
 */

import { useEffect, useEffectEvent } from 'react';
import { useAuth } from './AuthContext';
import { useTheme } from './ThemeContext';

export function ThemeSyncBridge() {
  const { user, authenticated } = useAuth();
  const { applyUserPreferences } = useTheme();

  const applyForSignedIn = useEffectEvent(() => {
    if (authenticated && user) {
      applyUserPreferences(user.preferences ?? null);
    } else {
      applyUserPreferences(null);
    }
  });

  // Keyed on the preferences' contents, so a partial update (savePref)
  // applies again and a refreshed user object with the same ones does not.
  const preferencesKey = JSON.stringify(user?.preferences ?? null);
  useEffect(() => {
    applyForSignedIn();
  }, [authenticated, user?.id, preferencesKey]);

  return null;
}

export default ThemeSyncBridge;
