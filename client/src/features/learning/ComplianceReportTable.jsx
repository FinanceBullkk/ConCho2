import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const ASSIGNMENT_TONE = {
  complete: 'success',
  in_progress: 'info',
  overdue: 'danger',
  not_started: 'neutral',
};

const CERTIFICATE_TONE = {
  issued: 'success',
  expiring: 'warning',
  expired: 'danger',
  revoked: 'danger',
  missing: 'neutral',
};

const formatDate = (value) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
};

function StatTile({ label, value }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="text-caption text-muted-foreground">{label}</div>
      <div className="text-h3 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function StatusBadge({ group, value, tones }) {
  const { t } = useTranslation();
  return (
    <Badge variant={tones[value] || 'neutral'} size="sm">
      {t(`learning.reports.compliance.${group}.${value}`)}
    </Badge>
  );
}

export default function ComplianceReportTable({ report }) {
  const { t } = useTranslation();
  const { summary = {}, rows = [] } = report;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label={t('learning.reports.compliance.summary.total')} value={summary.rows || 0} />
        <StatTile label={t('learning.reports.compliance.summary.overdue')} value={summary.overdue || 0} />
        <StatTile label={t('learning.reports.compliance.summary.complete')} value={summary.complete || 0} />
        <StatTile label={t('learning.reports.compliance.summary.certified')} value={summary.issued || 0} />
        <StatTile label={t('learning.reports.compliance.summary.expiring')} value={summary.expiring || 0} />
        <StatTile label={t('learning.reports.compliance.summary.expired')} value={summary.expired || 0} />
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('learning.reports.compliance.col.learner')}</TableHead>
              <TableHead>{t('learning.reports.compliance.col.org')}</TableHead>
              <TableHead>{t('learning.reports.compliance.col.assignment')}</TableHead>
              <TableHead>{t('learning.reports.compliance.col.dueDate')}</TableHead>
              <TableHead>{t('learning.reports.compliance.col.assignmentStatus')}</TableHead>
              <TableHead>{t('learning.reports.compliance.col.certificateState')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.assignment.id}-${row.learner.id}`}>
                <TableCell className="min-w-[170px]">
                  <div className="font-medium text-foreground">{row.learner.name}</div>
                  <div className="text-small text-muted-foreground">{row.learner.empCode}</div>
                </TableCell>
                <TableCell className="min-w-[190px]">
                  <div className="text-foreground">{row.org.departmentName}</div>
                  <div className="text-small text-muted-foreground">{row.org.managerName}</div>
                </TableCell>
                <TableCell className="min-w-[220px] max-w-[320px]">
                  <div className="break-words font-medium text-foreground">{row.assignment.title}</div>
                  <div className="break-words text-small text-muted-foreground">{row.assignment.targetName}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(row.assignment.dueDate)}</TableCell>
                <TableCell>
                  <StatusBadge group="status" value={row.assignment.status} tones={ASSIGNMENT_TONE} />
                </TableCell>
                <TableCell className="min-w-[150px]">
                  <StatusBadge group="certificateState" value={row.certificate.state} tones={CERTIFICATE_TONE} />
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.certificate.validUntil
                      ? `${t('learning.reports.compliance.validUntil')} ${formatDate(row.certificate.validUntil)}`
                      : row.certificate.number || t('learning.reports.na')}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
