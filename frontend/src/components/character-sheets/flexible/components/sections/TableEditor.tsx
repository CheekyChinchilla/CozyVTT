/**
 * Table Editor Component
 */

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { TableSection } from '../../../../../types/flexible-character-sheet';
import { generateId } from '../../utils/section-helpers';

interface TableEditorProps {
  section: TableSection;
  onUpdate: (updates: Partial<TableSection>) => void;
}

export const TableEditor: React.FC<TableEditorProps> = ({ section, onUpdate }) => {
  const addColumn = () => {
    const newColumn = {
      id: generateId(),
      name: 'New Column',
      width: `${100 / (section.columns.length + 1)}%`,
    };
    // Update existing column widths
    const updatedColumns = section.columns.map((col) => ({
      ...col,
      width: `${100 / (section.columns.length + 1)}%`,
    }));
    onUpdate({ columns: [...updatedColumns, newColumn] });
  };

  const removeColumn = (columnId: string) => {
    // Remove column and update cell data in all rows
    const updatedRows = section.rows.map((row) => {
      const { [columnId]: _, ...remainingCells } = row.cells;
      return { ...row, cells: remainingCells };
    });
    onUpdate({
      columns: section.columns.filter((c) => c.id !== columnId),
      rows: updatedRows,
    });
  };

  const updateColumnName = (columnId: string, name: string) => {
    onUpdate({
      columns: section.columns.map((c) => (c.id === columnId ? { ...c, name } : c)),
    });
  };

  const addRow = () => {
    const newRow = {
      id: generateId(),
      cells: section.columns.reduce((acc, col) => ({ ...acc, [col.id]: '' }), {}),
    };
    onUpdate({ rows: [...section.rows, newRow] });
  };

  const removeRow = (rowId: string) => {
    onUpdate({ rows: section.rows.filter((r) => r.id !== rowId) });
  };

  const updateCell = (rowId: string, columnId: string, value: string) => {
    onUpdate({
      rows: section.rows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [columnId]: value } } : r
      ),
    });
  };

  return (
    <div className="p-4 space-y-4 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-moss-green/10 border-b-2 border-moss-green/30">
            {section.columns.map((column) => (
              <th key={column.id} className="px-2 py-2 relative group" style={{ width: column.width }}>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={column.name}
                    onChange={(e) => updateColumnName(column.id, e.target.value)}
                    className="flex-1 bg-transparent border-b border-moss-green/30 focus:border-moss-green focus:outline-none text-sm font-semibold text-moss-green"
                    placeholder="Column name"
                  />
                  {section.columns.length > 1 && (
                    <button
                      onClick={() => removeColumn(column.id)}
                      className="p-1 rounded bg-red-50 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"
                      title="Remove column"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </th>
            ))}
            <th className="px-2 py-2 w-12">
              <button
                onClick={addColumn}
                className="p-1 rounded bg-moss-green/10 text-moss-green hover:bg-moss-green/20"
                title="Add column"
              >
                <Plus className="w-4 h-4" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row, rowIndex) => (
            <tr
              key={row.id}
              className={`border-b border-stone-gray/20 group ${
                rowIndex % 2 === 0 ? 'bg-parchment/10' : ''
              }`}
            >
              {section.columns.map((column) => (
                <td key={column.id} className="px-2 py-2">
                  <input
                    type="text"
                    value={row.cells[column.id] || ''}
                    onChange={(e) => updateCell(row.id, column.id, e.target.value)}
                    className="w-full bg-transparent border-b border-transparent focus:border-moss-green focus:outline-none text-warm-gray"
                    placeholder="-"
                  />
                </td>
              ))}
              <td className="px-2 py-2">
                <button
                  onClick={() => removeRow(row.id)}
                  className="p-1 rounded bg-red-50 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"
                  title="Remove row"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        onClick={addRow}
        className="flex items-center gap-2 px-4 py-2 bg-moss-green/10 text-moss-green rounded-lg hover:bg-moss-green/20 transition-colors w-full justify-center"
      >
        <Plus className="w-4 h-4" />
        Add Row
      </button>
    </div>
  );
};
