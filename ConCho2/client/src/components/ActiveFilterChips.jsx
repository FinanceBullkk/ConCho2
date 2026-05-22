import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// ActiveFilterChips — Phase 3 Screen 5 §D rule 4
//
// "Active filter chips: appear inline as removable pills · 'All' chip
//  clears all". Renders one × chip per currently-applied facet, plus
//  a single "Clear all" affordance when any are active.
//
// Props:
//   filters    Array<{ key, label, onRemove }>
//   onClearAll optional () => void — renders "Clear all" button if set
//   className  optional wrapper class
//
// Each filter chip shows its label (e.g. "Role: Admin") and an × button
// that calls onRemove. The component renders nothing if filters is empty.
//
// Designed to pair with StatusChips above and FilterBar below.
// ──────────────────────────────────────────────────────────

export function ActiveFilterChips({ filters = [], onClearAll, className }) {
  if (!filters.length) return null;

  return (
    <div className={cn('inline-flex flex-wrap items-center gap-1.5', className)} role="region" aria-label="Active filters">
      {filters.map((f) => (
        <span
          key={f.key}
          className="inline-flex items-center gap-1 pl-2 pr-1 h-7 rounded-md
                     bg-primary-tint text-primary text-xs font-medium border border-primary/20"
        >
          <span className="truncate max-w-[160px]">{f.label}</span>
          <button
            type="button"
            onClick={f.onRemove}
            aria-label={`Remove ${f.label} filter`}
            className="rounded p-0.5 hover:bg-primary/10 transition-colors"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </span>
      ))}
      {onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline px-1.5"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
