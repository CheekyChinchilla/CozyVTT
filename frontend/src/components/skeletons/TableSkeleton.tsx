// ============================================
// TableSkeleton
// Generic pulsing table rows
// ============================================

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

// Alternating column widths so adjacent cells look natural
const COL_WIDTHS = ['w-1/4', 'w-1/3', 'w-1/5', 'w-2/5', 'w-1/6', 'w-1/4'];

export default function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <div className="animate-pulse">
      {/* Header row */}
      <div className="flex gap-4 px-4 py-3 border-b border-moss-green/10">
        {[...Array(columns)].map((_, c) => (
          <div
            key={c}
            className={`h-4 bg-moss-green/15 rounded ${COL_WIDTHS[c % COL_WIDTHS.length]}`}
          />
        ))}
      </div>

      {/* Data rows */}
      {[...Array(rows)].map((_, r) => (
        <div
          key={r}
          className={`flex gap-4 px-4 py-3 border-b border-moss-green/5 ${
            r % 2 === 0 ? 'bg-moss-green/[0.02]' : ''
          }`}
        >
          {[...Array(columns)].map((_, c) => (
            <div
              key={c}
              className={`h-4 bg-stone-gray/10 rounded ${
                COL_WIDTHS[(c + r + 1) % COL_WIDTHS.length]
              }`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
