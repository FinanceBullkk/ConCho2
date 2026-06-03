import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import {
  useLearningCohorts,
  useCompletionReport,
  useCompletionRollup,
  useDownloadCompletionReport,
} from '../../hooks/useLearning';
import CompletionReportTable from './CompletionReportTable';
import CompletionRollupTable from './CompletionRollupTable';

// Trigger a browser download from the blob response, reading the filename from
// Content-Disposition (mirrors the HR export flow).
const saveBlob = (res, fallback) => {
  const disposition = res.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : fallback;
  const blob = new Blob([res.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

export default function ReportsTab() {
  const { t } = useTranslation();
  const [cohortId, setCohortId] = useState('');

  const { data: cohortData } = useLearningCohorts();
  const cohorts = cohortData?.data || [];

  const { data: report, isLoading } = useCompletionReport(cohortId);
  const {
    data: rollup,
    isFetching: rollupLoading,
    refetch: loadRollup,
  } = useCompletionRollup({ enabled: false });
  const download = useDownloadCompletionReport();

  const handleExport = async () => {
    try {
      const res = await download.mutateAsync(cohortId);
      saveBlob(res, `completion-${cohortId}.xlsx`);
    } catch {
      toast.error(t('learning.reports.exportError'));
    }
  };

  const handleLoadRollup = async () => {
    try {
      await loadRollup();
    } catch {
      toast.error(t('learning.reports.rollup.loadError'));
    }
  };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <CardTitle>{t('learning.reports.title')}</CardTitle>
      <div className="flex items-center gap-2">
        <Select value={cohortId} onValueChange={setCohortId}>
          <SelectTrigger className="w-[220px]" aria-label={t('learning.reports.cohortLabel')}>
            <SelectValue placeholder={t('learning.reports.selectCohort')} />
          </SelectTrigger>
          <SelectContent>
            {cohorts.map((c) => (
              <SelectItem key={c._id} value={c._id}>
                {c.cohortCode} — {c.programName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={!cohortId || !report?.rows?.length || download.isPending}
          onClick={handleExport}
        >
          <Download className="size-4 mr-1.5" aria-hidden="true" />
          {download.isPending ? t('learning.reports.exporting') : t('learning.reports.export')}
        </Button>
      </div>
    </div>
  );

  let body;
  if (!cohortId) {
    body = <EmptyState title={t('learning.reports.title')} description={t('learning.reports.selectPrompt')} />;
  } else if (isLoading) {
    body = <TableSkeleton rows={6} cols={8} />;
  } else if (!report?.rows?.length) {
    body = <EmptyState title={t('learning.reports.noLearners')} description={t('learning.reports.noLearnersDesc')} />;
  } else {
    body = <CompletionReportTable report={report} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>{t('learning.reports.rollup.title')}</CardTitle>
          <Button size="sm" variant="outline" disabled={rollupLoading} onClick={handleLoadRollup}>
            {rollup ? (
              <RefreshCw className="size-4 mr-1.5" aria-hidden="true" />
            ) : (
              <BarChart3 className="size-4 mr-1.5" aria-hidden="true" />
            )}
            {rollupLoading
              ? t('learning.reports.rollup.loading')
              : t(rollup ? 'learning.reports.rollup.refresh' : 'learning.reports.rollup.load')}
          </Button>
        </CardHeader>
        <CardContent>
          {rollup || rollupLoading ? (
            <CompletionRollupTable rollup={rollup} isLoading={rollupLoading} />
          ) : (
            <EmptyState
              title={t('learning.reports.rollup.ready')}
              description={t('learning.reports.rollup.readyDesc')}
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>{header}</CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </div>
  );
}
