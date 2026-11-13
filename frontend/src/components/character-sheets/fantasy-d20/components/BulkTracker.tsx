// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * BulkTracker Component
 *
 * Displays inventory with Fantasy d20 bulk system.
 * Bulk can be: number (1, 2, 3...), "L" (light), or "—" (negligible).
 * 10 light items = 1 bulk, fractions rounded down.
 */

import React from 'react';
import { Package } from 'lucide-react';

import type { FantasyD20InventoryItem as InventoryItem, FantasyD20Currency } from '@/types/game-systems';
import { formatFantasyD20Bulk, fantasyD20BulkLimits, fantasyD20ItemBulk, fantasyD20TotalBulk } from '@/utils/rules/fantasyD20';

interface BulkTrackerProps {
  inventory: InventoryItem[];
  /** The character's coins, which weigh 1 Bulk a thousand. */
  currency?: FantasyD20Currency;
  /** The character's Strength modifier, which sets the limits. */
  strengthModifier: number;
}

/**
 * The inventory and the Bulk it carries, worked out from the items and
 * Strength by the shared rules, so the sheet shows what is carried now rather
 * than what was last stored.
 */
export const BulkTracker: React.FC<BulkTrackerProps> = ({ inventory, currency, strengthModifier }) => {
  const carried = fantasyD20TotalBulk(inventory, currency);
  const { encumbered, maximum, isEncumbered, isOverloaded } = fantasyD20BulkLimits(strengthModifier, carried.bulk);

  return (
    <div className="space-y-4">
      {/* Bulk Summary */}
      <div className="bg-info/10 border-2 border-info/30 rounded-lg p-4">
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-info-ink text-lg mb-1">Bulk Carried</h4>
            <div className="text-sm text-info-ink">
              <span className="font-semibold">{formatFantasyD20Bulk(carried)}</span>
              {' / '}
              <span>Encumbered above: {encumbered}</span>
              {' / '}
              <span>Max: {maximum}</span>
            </div>
          </div>
          <div className="text-right">
            {isOverloaded && (
              <div className="px-3 py-1 bg-danger/15 border border-danger/30 text-danger-ink text-sm font-bold rounded-lg">
                OVERLOADED
              </div>
            )}
            {isEncumbered && !isOverloaded && (
              <div className="px-3 py-1 bg-warning/15 border border-warning/30 text-warning-ink text-sm font-bold rounded-lg">
                ENCUMBERED
              </div>
            )}
            {!isEncumbered && (
              <div className="px-3 py-1 bg-success/15 border border-success/30 text-success-ink text-sm font-bold rounded-lg">
                UNENCUMBERED
              </div>
            )}
          </div>
        </div>

        {/* Bulk Bar */}
        <div className="mt-3 bg-ink/15 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full transition-all ${
              isOverloaded
                ? 'bg-danger'
                : isEncumbered
                ? 'bg-warning'
                : 'bg-success'
            }`}
            style={{ width: `${maximum > 0 ? Math.min((carried.bulk / maximum) * 100, 100) : 100}%` }}
          />
        </div>

        {isEncumbered && (
          <div className="mt-2 text-xs text-info-ink">
            <strong>Encumbered:</strong> -10 ft. to all speeds, Clumsy 1 condition
          </div>
        )}
      </div>

      {/* Inventory List */}
      <div className="space-y-2">
        {inventory.length === 0 && (
          <div className="text-center py-8 text-ink-muted italic">
            No items in inventory
          </div>
        )}

        {inventory.map((item, index) => (
          <div
            key={`${item.name}-${index}`}
            className="bg-paper border border-ink/10 rounded-lg p-3 shadow-xs hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              {/* Item Info */}
              <div className="flex-1">
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1 mb-1">
                  <Package className="w-4 h-4 text-ink-muted" />
                  <span className="font-semibold text-ink">{item.name}</span>
                  {item.equipped && (
                    <span className="px-2 py-0.5 bg-success/15 text-success-ink text-xs rounded-full font-medium">
                      Equipped
                    </span>
                  )}
                  {item.invested && (
                    <span className="px-2 py-0.5 bg-spirit/15 text-spirit-ink text-xs rounded-full font-medium">
                      Invested
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs text-ink-secondary mt-2">
                  <div>
                    <span className="font-semibold">Qty:</span> {item.quantity ?? 1}
                  </div>
                  <div>
                    <span className="font-semibold">Bulk:</span> {formatFantasyD20Bulk(fantasyD20ItemBulk(item.bulk))}
                    {(item.quantity ?? 1) > 1 && (
                      <span className="text-ink-muted">
                        {' '}(× {item.quantity} = {formatFantasyD20Bulk(fantasyD20TotalBulk([item]))})
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold">Value:</span> {item.value != null ? `${item.value} gp` : '—'}
                  </div>
                </div>

                {item.notes && (
                  <div className="mt-2 text-xs text-ink-secondary italic">
                    {item.notes}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BulkTracker;
