/**
 * The page shown while the sign-in check gets no answer: a restart or an
 * upgrade under way. The sign-in may well be fine, so it waits for the server
 * and offers to try now, instead of sending the user to sign in again.
 */
import Button from '@/components/ui/Button';

export default function ServerUnreachablePanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br/srgb from-soft-cream via-parchment to-warm-amber/20 px-4">
      <div role="alert" className="glass-panel max-w-md w-full p-8 text-center space-y-4">
        <h1 className="text-2xl font-bold text-brand-ink font-heading">Can't reach the server</h1>
        <p className="text-stone-gray">
          CozyVTT is not answering at the moment, perhaps because it is restarting. This page tries again by
          itself, or you can try now.
        </p>
        <Button onClick={onRetry} className="w-full">
          Try Again
        </Button>
      </div>
    </div>
  );
}
