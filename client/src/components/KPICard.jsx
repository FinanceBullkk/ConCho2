import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// KPICard — Phase 1 §09
//
// Single metric card: large tabular value + label + sub-label.
// Tone drives the accent colour (matches StatusBadge tones).
//
// Props:
//   label     string              metric name (top)
//   value     string | number     primary display number/text (large)
//   sub?      string              secondary line, e.g. "/ 230 total"
//   icon?     Lucide component    decorative icon (shown in top-right chip)
//   tone?     'neutral' | 'success' | 'warning' | 'danger' | 'info'
//   trend?    { delta: number, label?: string }
//             positive delta → green TrendingUp
//             negative delta → red TrendingDown
//             zero           → Minus
//   href?     string              wraps card in <a> for navigation
//   loading?  boolean             show skeleton shimmer
//   className? string
//
// Usage:
//   <KPICard
//     label="Active Students"
//     value={o.active}
//     sub={`/ ${o.totalStudents} total`}
//     icon={Users}
//     tone="success"
//     trend={{ delta: 12, label: 'vs last month' }}
//   />
// ──────────────────────────────────────────────────────────

import { Skeleton } from '@/components/ui/skeleton';

const TONE_ICON_BG = {
  neutral: 'bg-neutral-tint text-neutral',
  success: 'bg-success-tint text-success',
  warning: 'bg-warning-tint text-warning',
  danger:  'bg-destructive-tint text-destructive',
  info:    'bg-info-tint text-info',
};

export function KPICard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'neutral',
  trend,
  href,
  loading = false,
  className,
}) {
  const iconBg = TONE_ICON_BG[tone] ?? TONE_ICON_BG.neutral;

  const card = (
    <div
      className={cn(
        'bg-card border border-border rounded-lg p-4 flex flex-col gap-2',
        href && 'hover:border-border-strong transition-colors duration-(--dur) cursor-pointer',
        className,
      )}
    >
      {/* Top row: icon chip */}
      {Icon && (
        <div className={cn('self-start flex items-center justify-center size-8 rounded-md', iconBg)}>
          <Icon aria-hidden="true" style={{ width: 15, height: 15 }} strokeWidth={2} />
        </div>
      )}

      {/* Value */}
      {loading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <span className="text-h1 tabular-nums text-foreground leading-none">
          {value ?? '—'}
        </span>
      )}

      {/* Label + sub */}
      <div>
        {loading ? (
          <Skeleton className="h-3 w-24" />
        ) : (
          <span className="text-small font-medium text-muted-foreground block">{label}</span>
        )}
        {sub && !loading && (
          <span className="text-small text-subtle-foreground block mt-0.5">{sub}</span>
        )}
      </div>

      {/* Trend */}
      {trend != null && !loading && (
        <TrendChip delta={trend.delta} label={trend.label} />
      )}
    </div>
  );

  if (href) {
    return <a href={href} className="block">{card}</a>;
  }
  return card;
}

function TrendChip({ delta, label }) {
  if (delta == null) return null;
  const isUp   = delta > 0;
  const isDown = delta < 0;
  const Icon   = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const cls    = isUp
    ? 'text-success bg-success-tint'
    : isDown
    ? 'text-destructive bg-destructive-tint'
    : 'text-muted-foreground bg-muted';

  return (
    <div className={cn('inline-flex items-center gap-1 self-start rounded-md px-1.5 py-0.5 text-small font-medium', cls)}>
      <Icon style={{ width: 11, height: 11 }} strokeWidth={2} aria-hidden="true" />
      <span>
        {isUp ? '+' : ''}{delta}
        {label && <span className="font-normal opacity-70 ml-1">{label}</span>}
      </span>
    </div>
  );
}
