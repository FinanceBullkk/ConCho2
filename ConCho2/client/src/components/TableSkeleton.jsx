// ──────────────────────────────────────────────────────────
// TableSkeleton — standalone skeleton for tables that don't
// use DataTable (e.g. pages not yet migrated).
// Phase 1 §07 — tokenised border/color classes.
// ──────────────────────────────────────────────────────────
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';

export default function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="p-4 space-y-2" aria-busy="true" aria-label="Loading data…">
      {/* Header row */}
      <div className="flex gap-3 pb-2 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn('h-3', i === 0 ? 'w-24' : i === cols - 1 ? 'w-16 ml-auto' : 'flex-1')}
          />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 items-center py-1">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={cn('h-4', c === 0 ? 'w-20' : c === cols - 1 ? 'w-14 ml-auto' : 'flex-1')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
