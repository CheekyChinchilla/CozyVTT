/**
 * InventoryList Component
 *
 * Displays character inventory items and currency.
 * Updated: Added attunement slots tracker and better attunement display
 */

import React from 'react';
import { Package, Coins, Star } from 'lucide-react';

interface InventoryItem {
  name: string;
  quantity: number;
  weight: number;
  notes: string;
  equippable: boolean;
  equipped: boolean;
  requiresAttunement: boolean;
  attuned: boolean;
  value: number;
}

interface Currency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

interface InventoryListProps {
  inventory?: InventoryItem[];
  currency?: Currency;
}

/**
 * CurrencyDisplay - Shows character's money
 */
const CurrencyDisplay: React.FC<{ currency: Currency }> = ({ currency }) => {
  const coins = [
    { label: 'PP', value: currency.pp, color: 'text-slate-400' },
    { label: 'GP', value: currency.gp, color: 'text-yellow-600' },
    { label: 'EP', value: currency.ep, color: 'text-green-600' },
    { label: 'SP', value: currency.sp, color: 'text-gray-400' },
    { label: 'CP', value: currency.cp, color: 'text-amber-700' },
  ];

  return (
    <div className="p-4 bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-300 rounded-lg">
      <div className="flex items-center space-x-2 mb-3">
        <Coins className="w-5 h-5 text-yellow-700" />
        <h4 className="font-semibold text-stone-800">Currency</h4>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {coins.map(({ label, value, color }) => (
          <div key={label} className="text-center">
            <div className="text-xs text-stone-500 mb-1">{label}</div>
            <div className={`text-lg font-bold ${color}`}>{value}</div>
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
    <div className="flex items-center justify-between p-2 hover:bg-stone-50 rounded border-b border-stone-100 last:border-0">
      <div className="flex-1">
        <div className="flex items-center space-x-2">
          <Package className="w-4 h-4 text-stone-400" />
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <span className="font-medium text-stone-800">{item.name}</span>
              {item.equipped && (
                <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded border border-green-300">
                  Equipped
                </span>
              )}
              {item.attuned && (
                <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded border border-purple-300 flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  Attuned
                </span>
              )}
              {item.requiresAttunement && !item.attuned && (
                <span className="px-1.5 py-0.5 text-xs bg-amber-50 text-amber-700 rounded border border-amber-300">
                  Requires Attunement
                </span>
              )}
            </div>
            {item.notes && (
              <div className="text-xs text-stone-500 mt-1">{item.notes}</div>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-4 text-sm text-stone-600">
        <div className="text-right">
          <div className="text-xs text-stone-400">Qty</div>
          <div>{item.quantity}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-stone-400">Wt</div>
          <div>{item.weight} lb</div>
        </div>
      </div>
    </div>
  );
};

/**
 * InventoryList - Displays inventory and currency
 */
export const InventoryList: React.FC<InventoryListProps> = ({ inventory, currency }) => {
  const totalWeight = inventory?.reduce((sum, item) => sum + (item.weight * item.quantity), 0) || 0;

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
        <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Star className="w-5 h-5 text-purple-600" />
              <h4 className="font-semibold text-stone-800">Attunement Slots</h4>
            </div>
            <span className={`text-lg font-bold ${attunedCount >= maxAttunement ? 'text-red-600' : 'text-purple-700'}`}>
              {attunedCount} / {maxAttunement}
            </span>
          </div>
          <div className="flex space-x-2">
            {Array.from({ length: maxAttunement }).map((_, idx) => (
              <div
                key={idx}
                className={`flex-1 h-2 rounded-full ${
                  idx < attunedCount
                    ? 'bg-gradient-to-r from-purple-500 to-indigo-500'
                    : 'bg-stone-200'
                }`}
              />
            ))}
          </div>
          {attunedItems.length > 0 && (
            <div className="mt-3 text-xs text-purple-900">
              <span className="font-medium">Attuned to:</span>{' '}
              {attunedItems.map(item => item.name).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Inventory Items */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg overflow-hidden">
        <div className="p-3 bg-stone-100 border-b border-stone-200">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-stone-800">Equipment & Items</h4>
            <span className="text-sm text-stone-600">
              Total Weight: <span className="font-semibold">{totalWeight.toFixed(1)} lb</span>
            </span>
          </div>
        </div>
        <div className="divide-y divide-stone-100">
          {inventory && inventory.length > 0 ? (
            inventory.map((item, index) => (
              <InventoryItemRow key={index} item={item} />
            ))
          ) : (
            <div className="p-8 text-center text-stone-500">
              No items in inventory
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
