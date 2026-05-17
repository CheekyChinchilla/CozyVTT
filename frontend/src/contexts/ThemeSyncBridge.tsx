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

import { useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useTheme } from './ThemeContext';

export function ThemeSyncBridge() {
  const { user, authenticated } = useAuth();
  const { applyUserPreferences } = useTheme();

  useEffect(() => {
    if (authenticated && user) {
      applyUserPreferences(user.preferences ?? null);
    } else {
      applyUserPreferences(null);
    }
    // We intentionally key on the serialized preferences identity so that
    // partial updates (savePref) re-trigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, user?.id, JSON.stringify(user?.preferences ?? null)]);

  return null;
}

export default ThemeSyncBridge;
