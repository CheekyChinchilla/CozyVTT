/**
 * Table Display Component
 */

import React from 'react';
import type { TableSection } from '../../../../../types/flexible-character-sheet';

interface TableDisplayProps {
  section: TableSection;
}

export const TableDisplay: React.FC<TableDisplayProps> = ({ section }) => {
  if (section.rows.length === 0) {
    return (
      <div className="p-4 text-center text-stone-gray">
        No rows in this table. Switch to edit mode to add rows.
      </div>
    );
  }

  return (
    <div className="p-4 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-moss-green/10 border-b-2 border-moss-green/30">
            {section.columns.map((column) => (
              <th
                key={column.id}
                className="px-4 py-2 text-left text-sm font-semibold text-brand-ink"
                style={{ width: column.width }}
              >
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row, rowIndex) => (
            <tr
              key={row.id}
              className={`border-b border-stone-gray/20 hover:bg-parchment/20 transition-colors ${
                rowIndex % 2 === 0 ? 'bg-parchment/10' : ''
              }`}
            >
              {section.columns.map((column) => (
                <td key={column.id} className="px-4 py-2 text-warm-gray">
                  {row.cells[column.id] || ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
