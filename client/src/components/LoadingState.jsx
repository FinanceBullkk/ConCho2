import { Spinner } from './Spinner';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Page-level loading state. Two flavours per Phase 1 §02 + §08 hierarchy:
 *
 *   <200ms — no indicator (consumer should not even mount this)
 *    >200ms — spinner   (LoadingState mode='spinner')
 *    >1s    — skeleton  (LoadingState mode='skeleton')
 *
 * For inline spinners (button label, table cell), import <Spinner /> directly.
 */
export function LoadingState({ mode = 'spinner', label = 'Loading…', rows = 5, className }) {
  if (mode === 'skeleton') {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        aria-label={label}
        className={cn('space-y-3', className)}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground',
        className
      )}
    >
      <Spinner size={24} label={label} />
      <span className="text-small">{label}</span>
    </div>
  );
}
