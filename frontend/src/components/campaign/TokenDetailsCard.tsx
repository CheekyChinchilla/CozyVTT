// ============================================
// A token's details, in the card at the bottom-left of the map: a large view
// of its picture, its name and square, the hit points this viewer may see,
// its conditions in full, its initiative while it is in the turn order, and
// whether the viewer may move it.
//
// Conditions are listed here in full, for everyone rather than the DM alone.
// The badges drawn on the token are only two letters each, which is enough to
// tell them apart at a glance but not to learn them, and a player who cannot
// read what is afflicting a creature cannot play around it.
// ============================================

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Position, Token } from '@/types';
import type { CharacterHpInfo } from '@/utils/characterHp';
import { useTokenInitiative } from '@/stores/gameStore';
import { tokenDisplayName } from '@/utils/tokenDisplayName';
import { placeholderColor } from './map/layers/drawTokens';

interface TokenDetailsCardProps {
  token: Token;
  /** The square named beside the token's name. */
  square: Position;
  /**
   * The hit points this viewer may see, as `visibleTokenHp` decides: a
   * character's from its sheet, a creature's own only for the DM or once its
   * HP bar is on. Null shows no row.
   */
  hp: CharacterHpInfo | null;
  /** The token's picture, when it has one this viewer is sent. */
  imageSrc?: string;
  /** Whether this viewer may move the token; if not, the card says so. */
  mayMove: boolean;
  /**
   * Given, the card has a close button that calls it, and lets every other
   * press through to the map under it: the selection's card stays over the
   * map until it is closed, where a player may want to put a token down.
   * The hover card goes with the pointer and has neither.
   */
  onClose?: () => void;
}

/** One labelled row. The labels line up, so the panel reads as a list. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-19 shrink-0 text-[11px] uppercase tracking-wide text-warm-gray">
        {label}
      </span>
      <span className="min-w-0 text-sm text-brand-ink">{children}</span>
    </div>
  );
}

export default function TokenDetailsCard({ token, square, hp, imageSrc, mayMove, onClose }: TokenDetailsCardProps) {
  // `undefined` means "not in the turn order": the row is left out rather
  // than shown blank. `null` means it is, but nothing has rolled.
  const initiative = useTokenInitiative(token.id);
  const inTurnOrder = initiative !== undefined;
  const conditions = token.conditions ?? [];

  return (
    <div className={`absolute bottom-4 left-4 glass-panel px-4 py-3 bg-parchment/95 backdrop-blur-xs w-88 max-w-[calc(100%-2rem)] shadow-lg${onClose ? ' pointer-events-none' : ''}`}>
      <div className="flex items-start gap-3.5">
        {/* Large enough to actually recognise the art. On the map a token
            is often only a few dozen pixels at play zoom, which is what
            made "token images are hard to see" a real complaint. */}
        {imageSrc ? (
          <img
            src={imageSrc}
            alt=""
            className="w-18 h-18 rounded-cozy object-cover border-2 border-warm-amber/50 shrink-0"
          />
        ) : (
          <div
            className="w-18 h-18 rounded-cozy border-2 border-warm-amber/50 shrink-0 flex items-center justify-center text-2xl font-semibold text-white"
            style={{ backgroundColor: placeholderColor(token) }}
            aria-hidden="true"
          >
            {(token.name || '?').charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-sm font-semibold text-brand-ink truncate">
              {tokenDisplayName(token)}
            </span>
            <span className="text-xs text-stone-gray font-mono shrink-0">
              ({square.x}, {square.y})
            </span>
          </div>

          <div className="space-y-1">
            {hp && (
              <Row label="HP">
                <span className="font-mono">
                  {hp.current}/{hp.max}
                  {hp.temp > 0 && <span className="text-info-ink"> +{hp.temp}</span>}
                </span>
              </Row>
            )}

            {conditions.length > 0 && (
              <Row label="Conditions">
                <span className="flex flex-wrap gap-1">
                  {conditions.map((condition) => (
                    <span
                      key={condition}
                      className="px-1.5 py-0.5 rounded-cozy bg-warm-amber/20 border border-warm-amber/40 text-[11px] font-medium text-brand-ink capitalize"
                    >
                      {condition}
                    </span>
                  ))}
                </span>
              </Row>
            )}

            {inTurnOrder && (
              <Row label="Initiative">
                <span className="font-mono">
                  {initiative === null ? '—' : initiative}
                </span>
              </Row>
            )}
          </div>

          {!mayMove && (
            <div className="mt-1.5 text-[11px] text-warm-gray italic">
              Not yours to move
            </div>
          )}
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            title="Close details"
            className="pointer-events-auto -mr-2 -mt-1 p-2 shrink-0 rounded-cozy text-stone-gray hover:text-brand-ink hover:bg-moss-green/10 transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}

      </div>
    </div>
  );
}
