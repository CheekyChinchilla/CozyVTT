// ============================================
// The held token's way back, for a finger or a pen.
//
// A mouse puts a held token back by leaving the map, a right-click or Esc. A
// finger lifts off the map after every tap, so leaving says nothing, and a
// tablet may have no keyboard: this bar shows while a finger or a pen holds
// a token, naming it, and Put back does what Esc does. It sits top-centre
// over the map, under the toolbar and clear of the details card in the
// bottom-left and the preview controls in the bottom-right.
// ============================================

import Button from '@/components/ui/Button';

interface HeldTokenBarProps {
  /** The held token's name, as this viewer may see it. */
  name: string;
  /** Put the token back where it was picked up. */
  onPutBack: () => void;
}

export default function HeldTokenBar({ name, onPutBack }: HeldTokenBarProps) {
  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 glass-panel bg-parchment/95 backdrop-blur-xs shadow-lg px-3 py-2 flex items-center gap-3 max-w-[calc(100%-2rem)]">
      <p className="text-sm text-stone-gray min-w-0 truncate">
        Holding <span className="font-semibold text-brand-ink">{name}</span>
      </p>
      <Button variant="secondary" size="sm" onClick={onPutBack}>
        Put back
      </Button>
    </div>
  );
}
