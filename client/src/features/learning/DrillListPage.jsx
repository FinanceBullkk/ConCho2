import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import TableSkeleton from '@/components/TableSkeleton';
import { cn } from '@/lib/utils';
import { useComplianceReport } from '../../hooks/useLearning';

// ──────────────────────────────────────────────────────────
// DrillListPage — the "data → action" upgrade (TMS.update value layer, S1).
//
// Reached by clicking an operational-dashboard KPI (overdue / expiring /
// expired) or — later — a department/program row. It turns a single number
// into the filtered list of WHO is behind it, powered by the existing
// Admin-only org-wide compliance report (no new endpoint).
//
//   /reports/drill?metric=overdue
//   /reports/drill?metric=expiring
//   /reports/drill?metric=department&id=<deptId>&label=<name>
// ──────────────────────────────────────────────────────────

// metric → compliance-report filter. Kept tiny + declarative so new drill
// sources are a one-line addition.
const filterFor = (metric, id) => {
  switch (metric) {
    case 'overdue': return { status: 'overdue' };
    case 'expiring': return { certificateState: 'expiring' };
    case 'expired': return { certificateState: 'expired' };
    case 'department': return id ? { departmentId: id } : {};
    case 'program': return id ? { programId: id } : {};
    default: return {};
  }
};

const STATUS_TONE = {
  not_started: 'bg-surface-2 text-muted-foreground',
  in_progress: 'bg-primary-tint text-primary',
  complete: 'bg-success-tint text-success',
  overdue: 'bg-destructive-tint text-destructive',
};
const CERT_TONE = {
  issued: 'bg-success-tint text-success',
  missing: 'bg-surface-2 text-muted-foreground',
  revoked: 'bg-destructive-tint text-destructive',
  expiring: 'bg-warning-tint text-warning',
  expired: 'bg-destructive-tint text-destructive',
};

const initialsOf = (name) => (name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
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

function Pill({ className, children }) {
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', className)}>
      {children}
    </span>
  );
}

const fmtDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function DrillListPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const metric = params.get('metric') || 'default';
  const id = params.get('id') || '';
  const label = params.get('label') || '';

  const filters = filterFor(metric, id);
  const { data, isLoading, isError } = useComplianceReport(filters);

  const rows = data?.rows ?? [];
  const heading = label || t(`learning.dashboard.drill.metrics.${metric}`, {
    defaultValue: t('learning.dashboard.drill.metrics.default'),
  });

  return (
    <div className="space-y-4">
      <Link
        to="/reports?tab=learning"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('learning.dashboard.drill.back')}
      </Link>

      <PageHeader
        title={heading}
        description={isLoading ? '' : t('learning.dashboard.drill.count', { count: rows.length })}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{heading}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : isError ? (
            <EmptyState title={t('learning.dashboard.drill.loadError')} />
          ) : rows.length === 0 ? (
            <EmptyState title={t('learning.dashboard.drill.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-overline text-muted-foreground">
                    <th className="px-2 py-2 font-medium">{t('learning.dashboard.drill.columns.learner')}</th>
                    <th className="px-2 py-2 font-medium">{t('learning.dashboard.drill.columns.department')}</th>
                    <th className="px-2 py-2 font-medium">{t('learning.dashboard.drill.columns.program')}</th>
                    <th className="px-2 py-2 font-medium">{t('learning.dashboard.drill.columns.due')}</th>
                    <th className="px-2 py-2 font-medium">{t('learning.dashboard.drill.columns.status')}</th>
                    <th className="px-2 py-2 font-medium">{t('learning.dashboard.drill.columns.certificate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr
                      key={`${row.assignment?.id}-${row.learner?.id}-${index}`}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={row.learner?.name} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{row.learner?.name}</p>
                            <p className="truncate text-[11px] text-subtle-foreground">{row.learner?.empCode}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-muted-foreground">{row.org?.departmentName}</td>
                      <td className="px-2 py-2.5 text-muted-foreground">{row.assignment?.targetName || row.assignment?.title}</td>
                      <td className="px-2 py-2.5 tabular-nums text-muted-foreground">{fmtDate(row.assignment?.dueDate)}</td>
                      <td className="px-2 py-2.5">
                        {row.assignment?.status && (
                          <Pill className={STATUS_TONE[row.assignment.status]}>
                            {t(`learning.dashboard.drill.status.${row.assignment.status}`, { defaultValue: row.assignment.status })}
                          </Pill>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        {row.certificate?.state && (
                          <Pill className={CERT_TONE[row.certificate.state]}>
                            {t(`learning.dashboard.drill.cert.${row.certificate.state}`, { defaultValue: row.certificate.state })}
                          </Pill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
