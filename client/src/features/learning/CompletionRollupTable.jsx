import { useTranslation } from 'react-i18next';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';

function StatTile({ label, value }) {
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="text-caption text-muted-foreground">{label}</div>
      <div className="text-h3 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function RollupRows({ rows }) {
  const { t } = useTranslation();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('learning.reports.rollup.name')}</TableHead>
          <TableHead className="text-right">{t('learning.reports.rollup.cohorts')}</TableHead>
          <TableHead className="text-right">{t('learning.reports.summary.total')}</TableHead>
          <TableHead className="text-right">{t('learning.reports.summary.complete')}</TableHead>
          <TableHead className="text-right">{t('learning.reports.summary.completionRate')}</TableHead>
          <TableHead className="text-right">{t('learning.reports.summary.certificates')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="font-medium">{row.label}</TableCell>
            <TableCell className="text-right tabular-nums">{row.cohorts}</TableCell>
            <TableCell className="text-right tabular-nums">{row.learners}</TableCell>
            <TableCell className="text-right tabular-nums">{row.complete}</TableCell>
            <TableCell className="text-right tabular-nums">{row.completionRate}%</TableCell>
            <TableCell className="text-right tabular-nums">{row.certificatesIssued}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function CompletionRollupTable({ rollup, isLoading }) {
  const { t } = useTranslation();
  if (isLoading) return <TableSkeleton rows={6} cols={6} />;
  if (!rollup?.summary?.cohorts) {
    return <EmptyState title={t('learning.reports.rollup.empty')} description={t('learning.reports.rollup.emptyDesc')} />;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label={t('learning.reports.rollup.cohorts')} value={rollup.summary.cohorts} />
        <StatTile label={t('learning.reports.summary.total')} value={rollup.summary.learners} />
        <StatTile label={t('learning.reports.summary.complete')} value={rollup.summary.complete} />
        <StatTile label={t('learning.reports.summary.completionRate')} value={`${rollup.summary.completionRate}%`} />
        <StatTile label={t('learning.reports.summary.certificates')} value={rollup.summary.certificatesIssued} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">{t('learning.reports.rollup.programs')}</h3>
        <RollupRows rows={rollup.programs || []} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">{t('learning.reports.rollup.departments')}</h3>
        <RollupRows rows={rollup.departments || []} />
      </div>
    </div>
  );
}
