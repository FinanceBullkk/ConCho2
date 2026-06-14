import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

// Top-N drill lists for the operational dashboard (overdue assignments and
// soonest-expiring certificates). Pure presentational; data comes from the
// fail-soft bundle so callers only render these when the block is non-null.

const DAY = 86_400_000;
const initialsOf = (name) => (name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
// Deterministic hue from the name so each learner keeps a stable avatar colour.
const hueOf = (name) => [...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

function Avatar({ name }) {
  return (
    <span
      className="grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
      style={{ background: `oklch(0.6 0.13 ${hueOf(name)})` }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}

function DayBadge({ n, suffixKey, tone }) {
  const { t } = useTranslation();
  const cls = {
    danger: 'bg-destructive-tint text-destructive',
    warning: 'bg-warning-tint text-warning',
    neutral: 'bg-surface-2 text-muted-foreground',
  }[tone];
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums', cls)}>
      {t(suffixKey, { n })}
    </span>
  );
}

export function OverdueList({ items }) {
  const { t } = useTranslation();
  const [now] = useState(() => Date.now());
  if (!items?.length) {
    return <p className="text-xs text-muted-foreground">{t('learning.dashboard.noOverdue')}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((item, index) => {
        const daysLate = item.dueDate ? Math.max(0, Math.floor((now - new Date(item.dueDate).getTime()) / DAY)) : null;
        return (
          <li key={`${item.assignmentId}-${item.learner?.id || index}`} className="flex items-center gap-3 py-2">
            <Avatar name={item.learner?.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground" title={item.learner?.empCode}>{item.learner?.name}</p>
              <p className="truncate text-[11px] text-subtle-foreground">{item.assignmentTitle}</p>
            </div>
            {daysLate != null && (
              <DayBadge n={daysLate} suffixKey="learning.dashboard.daysLate" tone={daysLate > 12 ? 'danger' : 'warning'} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ExpiringCertificatesList({ items }) {
  const { t } = useTranslation();
  const [now] = useState(() => Date.now());
  if (!items?.length) {
    return <p className="text-xs text-muted-foreground">{t('learning.dashboard.noExpiring')}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((item, index) => {
        const daysLeft = item.validUntil ? Math.max(0, Math.ceil((new Date(item.validUntil).getTime() - now) / DAY)) : null;
        return (
          <li key={item.certificateNumber || index} className="flex items-center gap-3 py-2">
            <Avatar name={item.learnerName} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">{item.learnerName}</p>
              <p className="truncate text-[11px] text-subtle-foreground">{item.programName}</p>
            </div>
            {daysLeft != null && (
              <DayBadge n={daysLeft} suffixKey="learning.dashboard.daysLeft" tone={daysLeft < 10 ? 'danger' : 'warning'} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
