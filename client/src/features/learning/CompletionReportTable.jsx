import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// Met / Unmet / N-A cell for a required-or-not policy dimension.
function PolicyCell({ required, met }) {
  const { t } = useTranslation();
  if (!required) return <span className="text-muted-foreground">{t('learning.reports.na')}</span>;
  return (
    <Badge variant={met ? 'default' : 'destructive'}>
      {t(met ? 'learning.reports.met' : 'learning.reports.unmet')}
    </Badge>
  );
}

function StatTile({ label, value }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-caption text-muted-foreground">{label}</div>
        <div className="text-h3 font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

// Presentational completion report: summary tiles + per-learner table.
// Pure — takes the report object, holds no state (testable in isolation).
export default function CompletionReportTable({ report }) {
  const { t } = useTranslation();
  const { summary, rows } = report;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t('learning.reports.summary.total')} value={summary.total} />
        <StatTile label={t('learning.reports.summary.complete')} value={summary.complete} />
        <StatTile label={t('learning.reports.summary.completionRate')} value={`${summary.completionRate}%`} />
        <StatTile label={t('learning.reports.summary.certificates')} value={summary.certificatesIssued} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('learning.reports.col.empCode')}</TableHead>
            <TableHead>{t('learning.reports.col.name')}</TableHead>
            <TableHead>{t('learning.reports.col.department')}</TableHead>
            <TableHead className="text-right">{t('learning.reports.col.attendance')}</TableHead>
            <TableHead>{t('learning.reports.col.assessment')}</TableHead>
            <TableHead>{t('learning.reports.col.feedback')}</TableHead>
            <TableHead>{t('learning.reports.col.complete')}</TableHead>
            <TableHead>{t('learning.reports.col.certificate')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.learner.id}>
              <TableCell className="font-medium">{r.learner.empCode}</TableCell>
              <TableCell>{r.learner.name}</TableCell>
              <TableCell>{r.learner.department}</TableCell>
              <TableCell className="text-right tabular-nums">{r.attendancePercent}%</TableCell>
              <TableCell><PolicyCell required={r.assessmentRequired} met={r.assessmentMet} /></TableCell>
              <TableCell><PolicyCell required={r.feedbackRequired} met={r.feedbackMet} /></TableCell>
              <TableCell>
                <Badge variant={r.complete ? 'default' : 'secondary'}>
                  {t(r.complete ? 'learning.reports.yes' : 'learning.reports.no')}
                </Badge>
              </TableCell>
              <TableCell className="text-caption">
                {r.certificate ? r.certificate.number : <span className="text-muted-foreground">{t('learning.reports.na')}</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
