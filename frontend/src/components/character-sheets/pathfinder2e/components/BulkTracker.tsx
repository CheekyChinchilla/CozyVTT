/**
 * BulkTracker Component
 *
 * Displays inventory with Pathfinder 2e bulk system.
 * Bulk can be: number (1, 2, 3...), "L" (light), or "—" (negligible).
 * 10 light items = 1 bulk.
 */

import React from 'react';
import { Package } from 'lucide-react';

export interface InventoryItem {
  name: string;
  quantity: number;
  bulk: number | string; // Can be: 1, 0.1, "L", "—"
  equippable: boolean;
  equipped: boolean;
  requiresAttunement: boolean;
  attuned: boolean;
  invested: boolean; // PF2e specific: invested magic items
  value: number;
  notes?: string;
}

export interface BulkData {
  current: number;
  encumbered: number; // 5 + STR modifier
  maximum: number; // 10 + STR modifier
}

interface BulkTrackerProps {
  inventory: InventoryItem[];
  bulk: BulkData;
}

/**
 * Convert bulk value to number for calculation
 */
const bulkToNumber = (bulk: number | string): number => {
  if (typeof bulk === 'number') return bulk;
  if (bulk === 'L') return 0.1;
  if (bulk === '—' || bulk === '-') return 0;
  return 0;
};

/**
 * Calculate total bulk from inventory
 */
export const calculateTotalBulk = (inventory: InventoryItem[]): number => {
  return inventory.reduce((total, item) => {
    const itemBulk = bulkToNumber(item.bulk);
    return total + (itemBulk * item.quantity);
  }, 0);
};

/**
 * Format bulk for display
 */
const formatBulk = (bulk: number | string): string => {
  if (bulk === 'L') return 'L';
  if (bulk === '—' || bulk === '-') return '—';
  if (typeof bulk === 'number') {
    return bulk % 1 === 0 ? bulk.toString() : bulk.toFixed(1);
  }
  return bulk.toString();
};

export const BulkTracker: React.FC<BulkTrackerProps> = ({ inventory, bulk }) => {
  const isEncumbered = bulk.current >= bulk.encumbered;
  const isOverloaded = bulk.current > bulk.maximum;

  return (
    <div className="space-y-4">
      {/* Bulk Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-bold text-blue-800 text-lg mb-1">Bulk Carried</h4>
            <div className="text-sm text-blue-700">
              <span className="font-semibold">{bulk.current.toFixed(1)}</span>
              {' / '}
              <span>Encumbered: {bulk.encumbered}</span>
              {' / '}
              <span>Max: {bulk.maximum}</span>
            </div>
          </div>
          <div className="text-right">
            {isOverloaded && (
              <div className="px-3 py-1 bg-red-600 text-white text-sm font-bold rounded-lg">
                OVERLOADED
              </div>
            )}
            {isEncumbered && !isOverloaded && (
              <div className="px-3 py-1 bg-amber-600 text-white text-sm font-bold rounded-lg">
                ENCUMBERED
              </div>
            )}
            {!isEncumbered && (
              <div className="px-3 py-1 bg-green-600 text-white text-sm font-bold rounded-lg">
                UNENCUMBERED
              </div>
            )}
          </div>
        </div>

        {/* Bulk Bar */}
        <div className="mt-3 bg-stone-200 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full transition-all ${
              isOverloaded
                ? 'bg-red-600'
                : isEncumbered
                ? 'bg-amber-500'
                : 'bg-green-500'
            }`}
            style={{ width: `${Math.min((bulk.current / bulk.maximum) * 100, 100)}%` }}
          />
        </div>

        {isEncumbered && (
          <div className="mt-2 text-xs text-blue-700">
            <strong>Encumbered:</strong> -10 ft. to all speeds, Clumsy 1 condition
          </div>
        )}
      </div>

      {/* Inventory List */}
      <div className="space-y-2">
        {inventory.length === 0 && (
          <div className="text-center py-8 text-stone-500 italic">
            No items in inventory
          </div>
        )}

        {inventory.map((item, index) => (
          <div
            key={`${item.name}-${index}`}
            className="bg-white border border-stone-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              {/* Item Info */}
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <Package className="w-4 h-4 text-stone-500" />
                  <span className="font-semibold text-stone-800">{item.name}</span>
                  {item.equipped && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                      Equipped
                    </span>
                  )}
                  {item.invested && (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                      Invested
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs text-stone-600 mt-2">
                  <div>
                    <span className="font-semibold">Qty:</span> {item.quantity}
                  </div>
                  <div>
                    <span className="font-semibold">Bulk:</span> {formatBulk(item.bulk)}
                    {item.quantity > 1 && (
                      <span className="text-stone-500">
                        {' '}(× {item.quantity} = {(bulkToNumber(item.bulk) * item.quantity).toFixed(1)})
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold">Value:</span> {item.value} gp
                  </div>
                </div>

                {item.notes && (
                  <div className="mt-2 text-xs text-stone-600 italic">
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
