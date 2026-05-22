import { useRef } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// FilterBar — Phase 1 §08
//
// Consistent search + filter bar used above every data table.
// Replaces 7+ hand-rolled filter bars across pages.
//
// Props:
//   search          string       controlled search value
//   onSearch        fn(string)   called on every keystroke
//                                (debounce in the page, not here)
//   searchPlaceholder  string    (default 'Search…')
//   searchMaxWidth  string       Tailwind width (default 'max-w-xs')
//   filters         FilterItem[] select dropdowns (see shape below)
//   children        ReactNode    arbitrary action elements (buttons, etc.)
//                                rendered at the trailing edge
//
// FilterItem shape:
//   {
//     key          string              unique key
//     placeholder  string              "All Roles", "All Statuses" …
//     options      string[] | {value, label}[]
//     value        string              current value ('' = no filter)
//     onChange     (value: string) => void
//     width?       string              Tailwind w-* class (default 'w-36')
//   }
//
// Usage — UsersPage:
//   <FilterBar
//     search={search}
//     onSearch={(v) => setParam('search', v)}
//     searchPlaceholder="Search by name, code or department…"
//     filters={[
//       { key: 'role', placeholder: 'All Roles', options: ROLES,
//         value: filterRole, onChange: (v) => setParam('role', v) },
//       { key: 'status', placeholder: 'All Statuses', options: STATUSES,
//         value: filterStatus, onChange: (v) => setParam('status', v) },
//     ]}
//   >
//     <Button onClick={() => setModal('create')}>+ New User</Button>
//     <Button variant="outline" onClick={reload}>↻ Refresh</Button>
//   </FilterBar>
// ──────────────────────────────────────────────────────────

const INPUT_CLS =
  'h-(--control-h) rounded-md border border-input bg-background px-3 text-sm text-foreground ' +
  'placeholder:text-subtle-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring ' +
  'transition-colors duration-(--dur-fast)';

export function FilterBar({
  // Search
  search = '',
  onSearch,
  searchPlaceholder = 'Search…',
  searchMaxWidth = 'max-w-xs',

  // Select filters
  filters = [],

  // Extra content (action buttons, etc.)
  children,

  className,
}) {
  const searchRef = useRef(null);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2',
        'bg-card border border-border rounded-lg px-4 py-3',
        className,
      )}
    >
      {/* Search input */}
      {onSearch !== undefined && (
        <div className={cn('relative flex-1 min-w-[180px]', searchMaxWidth)}>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-subtle-foreground"
            aria-hidden="true"
          />
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className={cn(INPUT_CLS, 'pl-8', search && 'pr-8')}
          />
          {search && (
            <button
              type="button"
              onClick={() => { onSearch(''); searchRef.current?.focus(); }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-subtle-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Select filters */}
      {filters.map(({ key: fKey, ...fProps }) => (
        <FilterSelect key={fKey} {...fProps} />
      ))}

      {/* Trailing actions */}
      {children && (
        <div className="ml-auto flex items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// FilterSelect — single <select> inside FilterBar
// ──────────────────────────────────────────────────────────

export function FilterSelect({ placeholder, options = [], value, onChange, width = 'w-36', className }) {
  const normalised = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  );

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={placeholder}
      className={cn(INPUT_CLS, 'cursor-pointer', width, className)}
    >
      <option value="">{placeholder}</option>
      {normalised.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
