import { useTranslation } from 'react-i18next';

// Top-N drill lists for the operational dashboard (overdue assignments and
// soonest-expiring certificates). Pure presentational; data comes from the
// fail-soft bundle so callers only render these when the block is non-null.

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

export function OverdueList({ items }) {
  const { t } = useTranslation();
  if (!items?.length) {
    return <p className="text-xs text-muted-foreground">{t('learning.dashboard.noOverdue')}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((item, index) => (
        <li
          key={`${item.assignmentId}-${item.learner?.id || index}`}
          className="flex items-center justify-between gap-3 py-1.5 text-xs"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">
              {item.learner?.name}
              <span className="ml-1 text-muted-foreground">({item.learner?.empCode})</span>
            </p>
            <p className="truncate text-muted-foreground">{item.assignmentTitle}</p>
          </div>
          <span className="shrink-0 tabular-nums text-destructive">
            {t('learning.dashboard.due', { date: formatDate(item.dueDate) })}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ExpiringCertificatesList({ items }) {
  const { t } = useTranslation();
  if (!items?.length) {
    return <p className="text-xs text-muted-foreground">{t('learning.dashboard.noExpiring')}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((item, index) => (
        <li
          key={item.certificateNumber || index}
          className="flex items-center justify-between gap-3 py-1.5 text-xs"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{item.learnerName}</p>
            <p className="truncate text-muted-foreground">{item.programName}</p>
          </div>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {t('learning.dashboard.validUntil', { date: formatDate(item.validUntil) })}
          </span>
        </li>
      ))}
    </ul>
  );
}
