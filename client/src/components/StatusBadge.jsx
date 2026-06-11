import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// StatusBadge — Phase 1 §06 · bound to Phase 0 §04 taxonomy
// ──────────────────────────────────────────────────────────
// 5 strict tones. Each tone = one semantic intent.
//   upcoming  → neutral / passive
//   warning   → action required by user (was "pending"/"to-mark")
//   info      → in progress / informational
//   success   → done / OK
//   danger    → config error / absent / critical
// ──────────────────────────────────────────────────────────

const TONE_CLS = {
  upcoming: 'bg-neutral-tint text-neutral border-border-strong',
  warning:  'bg-warning-tint text-warning border-warning/30',
  info:     'bg-info-tint text-info border-info/30',
  success:  'bg-success-tint text-success border-success/30',
  danger:   'bg-destructive-tint text-destructive border-destructive/30',
};

const SIZE_CLS = {
  sm: 'h-[18px] px-1.5 text-[11px] gap-1',
  md: 'h-[22px] px-2 text-[12px] gap-1',
};

const ICON_PX = { sm: 11, md: 13 };

// Mapping from status string → (tone, label). Add entries here, not in pages.
// Keys follow Phase 0 §04 canonical names + backwards-compat aliases for the
// previous server enum ('pending', 'partial', 'none', 'future').
const STATUS_MAP = {
  // ── Session attendance (§04 canonical lifecycle) ──
  upcoming:    { tone: 'upcoming', label: 'Upcoming' },
  toMark:      { tone: 'warning',  label: 'To mark' },
  inProgress:  { tone: 'info',     label: 'In progress' },
  done:        { tone: 'success',  label: 'Done' },
  noRoster:    { tone: 'danger',   label: 'No roster' },

  // ── Legacy server enum aliases (pre-taxonomy) ──
  pending:     { tone: 'warning',  label: 'To mark' },
  partial:     { tone: 'info',     label: 'In progress' },
  none:        { tone: 'danger',   label: 'No roster' },
  future:      { tone: 'upcoming', label: 'Upcoming' },

  // ── User status ──
  Active:               { tone: 'success',  label: 'Active' },
  Inactive:             { tone: 'upcoming', label: 'Inactive' },
  Dropped:              { tone: 'danger',   label: 'Dropped' },
  Transferred:          { tone: 'info',     label: 'Transferred' },
  'On-hold':            { tone: 'warning',  label: 'On hold' },
  'Waiting for class':  { tone: 'warning',  label: 'Waiting for class' },

  // ── Class lifecycle ──
  Ongoing:    { tone: 'success', label: 'Ongoing' },
  Completed:  { tone: 'info',    label: 'Completed' },

  // ── Attendance per-record ──
  P:       { tone: 'success', label: 'P' },
  Present: { tone: 'success', label: 'Present' },
  A:       { tone: 'danger',  label: 'A' },
  Absent:  { tone: 'danger',  label: 'Absent' },
  L:       { tone: 'warning', label: 'L' },
  Late:    { tone: 'warning', label: 'Late' },
  EL:      { tone: 'info',    label: 'EL' },
  Excused: { tone: 'info',    label: 'Excused' },

  // ── Roles ──
  Admin:        { tone: 'info',    label: 'Admin' },
  Coordinator:  { tone: 'info',    label: 'Coordinator' },
  Teacher:      { tone: 'success', label: 'Teacher' },
  Leader:       { tone: 'info',    label: 'Leader' },
  Participant:  { tone: 'warning', label: 'Participant' },
};

/**
 * StatusBadge — Phase 1 §06.
 *
 * Two API styles:
 *
 *   1. Mapped (backwards-compat):
 *      <StatusBadge status="Active" />
 *      <StatusBadge status="toMark" icon={AlertCircle} count={3} />
 *
 *   2. Explicit tone:
 *      <StatusBadge tone="warning" icon={AlertCircle}>To mark</StatusBadge>
 *
 * Props:
 *   status   — known status string (see STATUS_MAP above)
 *   tone     — explicit tone, overrides status mapping
 *   size     — 'sm' (18px) or 'md' (22px, default)
 *   icon     — Lucide icon component (sized to tone)
 *   count    — optional numeric suffix "· N" with tabular-nums
 *   children — override label text
 */
export function StatusBadge({
  status,
  tone,
  size = 'md',
  icon: Icon,
  count,
  children,
  className,
}) {
  const mapping = status ? STATUS_MAP[status] : null;
  const resolvedTone = tone ?? mapping?.tone ?? 'upcoming';
  const resolvedLabel = children ?? mapping?.label ?? status ?? '';
  const toneCls = TONE_CLS[resolvedTone] ?? TONE_CLS.upcoming;
  const sizeCls = SIZE_CLS[size] ?? SIZE_CLS.md;
  const iconPx = ICON_PX[size] ?? ICON_PX.md;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded border font-medium leading-none whitespace-nowrap tabular-nums transition-colors duration-(--dur)',
        sizeCls,
        toneCls,
        className,
      )}
    >
      {Icon && (
        <Icon
          style={{ width: iconPx, height: iconPx }}
          strokeWidth={2}
          aria-hidden="true"
        />
      )}
      {resolvedLabel && <span>{resolvedLabel}</span>}
      {count != null && <span>· {count}</span>}
    </span>
  );
}

// Re-export tone enum + map for consumers that need to introspect
// eslint-disable-next-line react-refresh/only-export-components
export const STATUS_BADGE_TONES = Object.keys(TONE_CLS);
export { STATUS_MAP };
