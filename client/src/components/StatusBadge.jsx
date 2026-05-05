import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Centralized status mapping. Add new statuses here, not in pages.
 * The class strings are utility-class strings (Tailwind) applied to a shadcn Badge
 * via `className` to override its default variant.
 */
const STATUS_STYLES = {
  // User / enrollment status
  Active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  Inactive: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  Dropped: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  Transferred: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  'On-hold': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  'Waiting for class': 'bg-violet-500/15 text-violet-300 border-violet-500/30',

  // Class lifecycle
  Ongoing: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  Completed: 'bg-blue-500/15 text-blue-300 border-blue-500/30',

  // Attendance per-record
  P: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  Present: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  A: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  Absent: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  L: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  Late: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  EL: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  Excused: 'bg-violet-500/15 text-violet-300 border-violet-500/30',

  // Session attendance roll-up status
  done: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  partial: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  none: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  future: 'bg-slate-500/15 text-slate-400 border-slate-500/30',

  // Roles
  Admin: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  Leader: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  Participant: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

const STATUS_LABELS = {
  done: 'Done',
  pending: 'Pending',
  partial: 'Partial',
  none: 'No students',
  future: 'Upcoming',
};

/**
 * <StatusBadge status="Active" />        → green pill "Active"
 * <StatusBadge status="pending" />       → amber pill "Pending"
 * Falls back to the raw status string with neutral styling if not mapped.
 */
export function StatusBadge({ status, className, children }) {
  const cls = STATUS_STYLES[status] ?? 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  const label = children ?? STATUS_LABELS[status] ?? status;
  return (
    <Badge variant="outline" className={cn('gap-1 font-medium', cls, className)}>
      {label}
    </Badge>
  );
}
