import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Dependency-free presentational primitives for the operational dashboard.
// No chart library by design (plan D3) — KPI tiles + CSS-width bars only, so the
// visual layer stays a thin swappable skin over the KPI bundle.

const CHIP_TONE = {
  primary: 'bg-primary-tint text-primary',
  success: 'bg-success-tint text-success',
  warning: 'bg-warning-tint text-warning',
  danger: 'bg-destructive-tint text-destructive',
  info: 'bg-info-tint text-info',
  neutral: 'bg-surface-2 text-muted-foreground',
};

// KPI tile — optional tone-coloured icon chip, label, large tabular value, hint.
// `icon`/`tone` are optional so existing callers keep working; `alert` (legacy)
// reddens the value and defaults the chip to the danger tone. When `to` is set
// the whole tile becomes a click-through link to a filtered drill list (the
// "data → action" upgrade) — it shows an arrow affordance + a "View list →"
// footer when no `hint` is supplied.
export function StatTile({ label, value, hint, icon: Icon, tone, alert = false, to }) {
  const { t } = useTranslation();
  const chipTone = tone ?? (alert ? 'danger' : 'neutral');
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className={cn('grid size-[30px] shrink-0 place-items-center rounded-lg', CHIP_TONE[chipTone])}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {to && (
          <ArrowUpRight
            className="ml-auto size-4 text-subtle-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        )}
      </div>
      <p className={cn('mt-2.5 text-[28px] font-bold leading-none tracking-tight tabular-nums', alert ? 'text-destructive' : 'text-foreground')}>
        {value}
      </p>
      {hint ? (
        <p className="mt-1.5 text-xs text-subtle-foreground">{hint}</p>
      ) : to ? (
        <p className="mt-1.5 text-xs font-medium text-primary">{t('learning.dashboard.viewList')}</p>
      ) : null}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="group block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </Link>
    );
  }

  return <div className="rounded-xl border border-border bg-card p-4">{body}</div>;
}

// Bar fill colour by threshold — higher is better (completion %, scaled rating).
const barColor = (percent) =>
  percent >= 80 ? 'bg-success' : percent >= 60 ? 'bg-primary' : percent >= 40 ? 'bg-warning' : 'bg-destructive';

// Horizontal bar list. rows: [{ key, label, display, percent (0–100), detail? }]
export function MetricBars({ title, rows }) {
  if (!rows?.length) return null;
  return (
    <div>
      <h4 className="mb-2.5 text-sm font-semibold text-foreground">{title}</h4>
      <ul className="space-y-2">
        {rows.map((row) => {
          const pct = Math.min(100, Math.max(0, row.percent ?? 0));
          return (
            <li key={row.key} className="text-xs">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground">{row.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {row.display}
                  {row.detail ? ` · ${row.detail}` : ''}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                <div
                  className={cn('h-full rounded-full transition-[width] duration-(--dur-slow)', barColor(pct))}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Segmented pill control (prototype `.seg`) — accessible button group used for
// the dashboard period picker. Real values pass straight through to the hook;
// this is a visual upgrade over a bare <select>, nothing more.
// options: string[]; labelFor(value) → display string; ariaLabel labels the group.
export function SegmentedControl({ value, onChange, options, labelFor, ariaLabel }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex gap-0.5 rounded-lg bg-surface-2 p-0.5"
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt)}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-colors duration-(--dur-fast)',
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {labelFor ? labelFor(opt) : opt}
          </button>
        );
      })}
    </div>
  );
}

// Shown in place of a metric block the server reported as failed (errors[]).
export function MetricUnavailable() {
  const { t } = useTranslation();
  return (
    <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
      {t('learning.dashboard.metricUnavailable')}
    </p>
  );
}
