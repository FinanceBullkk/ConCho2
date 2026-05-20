import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// SelectionBar — Phase 3 Screen 5 §D rules 8-9
//
// "Selection bar: appears when ≥1 selected · sticky · 'Clear' button
//  right side". Bulk actions are inline buttons, NOT a select+Apply
//  combo — per Screen 5 mockup (Change status… · Export selected · Delete).
//
// Props:
//   count       number                  selected row count (≥1 to render)
//   onClear     () => void               clear selection callback
//   children    ReactNode                inline action buttons
//   className   optional wrapper class
//
// Usage (UsersPage):
//   <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
//     <Button variant="outline" size="sm" onClick={openStatusMenu}>Change status…</Button>
//     <Button variant="outline" size="sm" onClick={exportSelected}>Export selected</Button>
//     {isAdmin && (
//       <Button variant="destructive" size="sm" onClick={openBulkDelete}>Delete</Button>
//     )}
//   </SelectionBar>
// ──────────────────────────────────────────────────────────

export function SelectionBar({ count, onClear, children, className }) {
  if (!count || count < 1) return null;

  return (
    <div
      role="region"
      aria-label={`${count} row${count > 1 ? 's' : ''} selected`}
      className={cn(
        'flex flex-wrap items-center gap-2 px-3 py-2 rounded-md',
        'bg-primary-tint border border-primary/20 text-primary',
        className,
      )}
    >
      <span className="text-sm font-medium tabular-nums">
        {count} selected
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {children}
      </div>

      <Button
        size="sm"
        variant="ghost"
        onClick={onClear}
        aria-label="Clear selection"
        className="ml-auto text-muted-foreground hover:text-foreground gap-1"
      >
        <X className="size-3.5" aria-hidden="true" />
        Clear
      </Button>
    </div>
  );
}
