import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// StatusChips — Phase 3 Screen 5 §D
//
// Inline single-select chip filter for the "primary status" axis
// (All / Active / Inactive / On-hold). Clicking the active chip
// clears the filter; "All" is the implicit empty state.
//
// Per the design contract (rule 3):
//   "Status chips: single-select 'primary status'
//    (All/Active/Inactive) · multi-select for facets (multiple BU)"
//
// Props:
//   value     string                       current selection ('' = All)
//   onChange  (next: string) => void       called with next value, or '' for All
//   options   Array<string | {value, label, count?}>
//   className optional wrapper class
//
// Usage (UsersPage):
//   <StatusChips
//     value={list.status}
//     onChange={list.setStatus}
//     options={[
//       { value: '',          label: 'All',      count: total },
//       { value: 'Active',    label: 'Active',   count: stats.active },
//       { value: 'Inactive',  label: 'Inactive', count: stats.inactive },
//       { value: 'On-hold',   label: 'On-hold' },
//     ]}
//   />
// ──────────────────────────────────────────────────────────

export function StatusChips({ value = '', onChange, options = [], className }) {
  const normalised = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  );

  return (
    <div className={cn('inline-flex flex-wrap items-center gap-1.5', className)} role="group" aria-label="Status filter">
      {normalised.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value || '__all__'}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={isActive}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-medium',
              'border transition-colors duration-(--dur-fast) select-none',
              isActive
                ? 'bg-primary-tint text-primary border-primary/30'
                : 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-accent',
            )}
          >
            <span>{opt.label}</span>
            {typeof opt.count === 'number' && (
              <span
                className={cn(
                  'tabular-nums text-[10px] font-semibold rounded px-1',
                  isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
