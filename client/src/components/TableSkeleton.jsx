// Skeleton placeholder for table loading states
import { Skeleton } from './ui/skeleton';

export default function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading data…">
      {/* Table header skeleton */}
      <div className="flex gap-4 pb-2 border-b border-white/5">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={`h-4 rounded ${i === 0 ? 'w-24' : i === cols - 1 ? 'w-16 ml-auto' : 'flex-1'}`} />
        ))}
      </div>
      {/* Row skeletons */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 items-center py-1">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={`h-5 rounded-lg ${c === 0 ? 'w-20' : c === cols - 1 ? 'w-14 ml-auto' : 'flex-1'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
