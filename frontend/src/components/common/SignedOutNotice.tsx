/**
 * Shown in an editor whose browser was signed out while it held unsaved
 * changes. The page has stayed where it is; signing in again in another tab
 * shares the session with this one, so Save then works.
 */
export default function SignedOutNotice() {
  return (
    <div role="alert" className="mb-4 bg-danger/10 border border-danger/30 rounded-lg p-4">
      <p className="text-sm text-danger font-medium">You&apos;ve been signed out.</p>
      <p className="text-sm text-ink mt-1">
        Your changes are still here, but they can&apos;t be saved until you sign in again.{' '}
        <a href="/auth/login" target="_blank" rel="noopener noreferrer" className="font-medium underline">
          Sign in in a new tab
        </a>
        , then come back and press Save.
      </p>
    </div>
  );
}
