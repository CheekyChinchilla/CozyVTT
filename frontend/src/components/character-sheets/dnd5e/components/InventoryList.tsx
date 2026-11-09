/**
 * InventoryList Component
 *
 * Displays character inventory items and currency.
 * Updated: Added attunement slots tracker and better attunement display
 */

import React from 'react';
import { Package, Coins, Star } from 'lucide-react';

import type { DnD5eInventoryItem as InventoryItem, DnD5eCurrency as Currency } from '@/types/game-systems';
import { carryingCapacity } from '@/utils/rules/dnd5e';

interface InventoryListProps {
  inventory?: InventoryItem[];
  currency?: Currency;
  /** The character's Strength score, which sets what they can carry. */
  strengthScore?: number;
}

/**
 * CurrencyDisplay - Shows character's money
 */
const CurrencyDisplay: React.FC<{ currency: Currency }> = ({ currency }) => {
  const coins = [
    { label: 'PP', value: currency.pp },
    { label: 'GP', value: currency.gp },
    { label: 'EP', value: currency.ep },
    { label: 'SP', value: currency.sp },
    { label: 'CP', value: currency.cp },
  ];

  return (
    <div className="p-4 bg-ink/10 border-2 border-ink/20 rounded-lg">
      <div className="flex items-center space-x-2 mb-3">
        <Coins className="w-5 h-5 text-ink-secondary" />
        <h4 className="font-semibold text-ink">Currency</h4>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {coins.map(({ label, value }) => (
          <div key={label} className="text-center">
            <div className="text-xs text-ink-muted mb-1">{label}</div>
            <div className="text-lg font-bold text-ink">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * InventoryItem Row
 */
const InventoryItemRow: React.FC<{ item: InventoryItem }> = ({ item }) => {
  return (
    <div className="flex items-center justify-between p-2 hover:bg-ink/5 rounded-sm border-b border-ink/10 last:border-0">
      <div className="flex-1">
        <div className="flex items-center space-x-2">
          <Package className="w-4 h-4 text-ink-muted" />
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <span className="font-medium text-ink">{item.name}</span>
              {item.equipped && (
                <span className="px-1.5 py-0.5 text-xs bg-success/15 text-success-ink rounded-sm border border-success/30">
                  Equipped
                </span>
              )}
              {item.attuned && (
                <span className="px-1.5 py-0.5 text-xs bg-spirit/15 text-spirit-ink rounded-sm border border-spirit/30 flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  Attuned
                </span>
              )}
              {item.requiresAttunement && !item.attuned && (
                <span className="px-1.5 py-0.5 text-xs bg-warning/15 text-warning-ink rounded-sm border border-warning/30">
                  Requires Attunement
                </span>
              )}
            </div>
            {item.notes && (
              <div className="text-xs text-ink-muted mt-1">{item.notes}</div>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-4 text-sm text-ink-secondary">
        <div className="text-right">
          <div className="text-xs text-ink-muted">Qty</div>
          <div>{item.quantity ?? '—'}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-muted">Wt</div>
          <div>{item.weight != null ? `${item.weight} lb` : '—'}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-muted">Value</div>
          <div>{item.value != null ? `${item.value} gp` : '—'}</div>
        </div>
      </div>
    </div>
  );
};

/**
 * InventoryList - Displays inventory and currency
 */
export const InventoryList: React.FC<InventoryListProps> = ({ inventory, currency, strengthScore }) => {
  // The schema lets an item go without either: one with no weight weighs
  // nothing, and one with no quantity is one item.
  const totalWeight = inventory?.reduce((sum, item) => sum + (item.weight ?? 0) * (item.quantity ?? 1), 0) ?? 0;

  // Calculate attunement slots (D&D 5e max: 3 attuned items)
  const attunedItems = inventory?.filter(item => item.attuned) || [];
  const attunedCount = attunedItems.length;
  const maxAttunement = 3;

  return (
    <div className="space-y-4">
      {/* Currency */}
      {currency && <CurrencyDisplay currency={currency} />}

      {/* Attunement Slots Tracker */}
      {inventory && inventory.some(item => item.requiresAttunement || item.attuned) && (
        <div className="p-4 bg-spirit/10 border-2 border-spirit/30 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Star className="w-5 h-5 text-spirit-ink" />
              <h4 className="font-semibold text-ink">Attunement Slots</h4>
            </div>
            <span className={`text-lg font-bold ${attunedCount >= maxAttunement ? 'text-danger-ink' : 'text-spirit-ink'}`}>
              {attunedCount} / {maxAttunement}
            </span>
          </div>
          <div className="flex space-x-2">
            {Array.from({ length: maxAttunement }).map((_, idx) => (
              <div
                key={idx}
                className={`flex-1 h-2 rounded-full ${
                  idx < attunedCount
                    ? 'bg-spirit'
                    : 'bg-ink/15'
                }`}
              />
            ))}
          </div>
          {attunedItems.length > 0 && (
            <div className="mt-3 text-xs text-spirit-ink">
              <span className="font-medium">Attuned to:</span>{' '}
              {attunedItems.map(item => item.name).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Inventory Items */}
      <div className="bg-ink/5 border border-ink/10 rounded-lg overflow-hidden">
        <div className="p-3 bg-ink/10 border-b border-ink/10">
          <div className="flex flex-wrap items-center justify-between gap-x-4 sm:flex-nowrap">
            <h4 className="font-semibold text-ink">Equipment & Items</h4>
            <span className="text-sm text-ink-secondary">
              Total Weight: <span className="font-semibold">{totalWeight.toFixed(1)} lb</span>
            </span>
          </div>
          {strengthScore != null && (
            <div className="mt-1 text-right text-xs text-ink-secondary">
              Carrying capacity: {carryingCapacity(strengthScore).carry} lb (push, drag or lift{' '}
              {carryingCapacity(strengthScore).pushDragLift} lb)
            </div>
          )}
        </div>
        <div className="divide-y divide-ink/10">
          {inventory && inventory.length > 0 ? (
            inventory.map((item, index) => (
              <InventoryItemRow key={index} item={item} />
            ))
          ) : (
            <div className="p-8 text-center text-ink-muted">
              No items in inventory
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
