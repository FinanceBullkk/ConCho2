import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Download, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useDepartments } from '../../hooks/useOrg';
import { useUsers } from '../../hooks/useUsers';
import {
  useComplianceReport,
  useDownloadComplianceReport,
  useLearningAssignments,
  useLearningPrograms,
} from '../../hooks/useLearning';
import ComplianceReportFilters from './ComplianceReportFilters';
import ComplianceReportTable from './ComplianceReportTable';
import { saveBlob } from './report-download';

const INITIAL_FILTERS = {
  assignmentId: '',
  programId: '',
  departmentId: '',
  managerId: '',
  status: '',
  certificateState: '',
  dueFrom: '',
  dueTo: '',
};

const cleanFilters = (filters) =>
  Object.fromEntries(Object.entries(filters).filter(([, value]) => Boolean(value)));

const sameFilters = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function ComplianceReportPanel() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState({});
  const [hasLoaded, setHasLoaded] = useState(false);

  const { data: assignmentData } = useLearningAssignments({ status: 'active' });
  const { data: programData } = useLearningPrograms({ status: 'active' });
  const { data: departments = [] } = useDepartments({ status: 'active' });
  const { data: usersData } = useUsers({ status: 'Active', limit: 200 });
  const download = useDownloadComplianceReport();

  const {
    data: report,
    isFetching,
    refetch,
  } = useComplianceReport(appliedFilters, {
    enabled: hasLoaded,
  });

  const assignments = assignmentData?.data || [];
  const programs = programData?.data || [];
  const managers = usersData?.data || [];
  const invalidDueRange = Boolean(filters.dueFrom && filters.dueTo && filters.dueFrom > filters.dueTo);
  const cleanedFilters = useMemo(() => cleanFilters(filters), [filters]);

  const setFilter = (key) => (event) => {
    setFilters((current) => ({ ...current, [key]: event.target.value }));
  };

  const handleLoad = async () => {
    if (invalidDueRange) return;
    if (hasLoaded && sameFilters(cleanedFilters, appliedFilters)) {
      await refetch();
      return;
    }
    setAppliedFilters(cleanedFilters);
    setHasLoaded(true);
  };

  const handleReset = () => {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters({});
    setHasLoaded(false);
  };

  const handleExport = async () => {
    try {
      const res = await download.mutateAsync(appliedFilters);
      saveBlob(res, 'compliance-report.xlsx');
    } catch {
      toast.error(t('learning.reports.exportError'));
    }
  };

  let body;
  if (!hasLoaded) {
    body = (
      <EmptyState
        title={t('learning.reports.compliance.ready')}
        description={t('learning.reports.compliance.readyDesc')}
      />
    );
  } else if (isFetching && !report) {
    body = <TableSkeleton rows={6} cols={6} />;
  } else if (!report?.rows?.length) {
    body = (
      <EmptyState
        title={t('learning.reports.compliance.empty')}
        description={t('learning.reports.compliance.emptyDesc')}
      />
    );
  } else {
    body = <ComplianceReportTable report={report} />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t('learning.reports.compliance.title')}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleReset}>
              <RotateCcw className="size-4 mr-1.5" aria-hidden="true" />
              {t('learning.reports.compliance.reset')}
            </Button>
            <Button size="sm" onClick={handleLoad} disabled={invalidDueRange || isFetching}>
              <Search className="size-4 mr-1.5" aria-hidden="true" />
              {isFetching ? t('learning.reports.compliance.loading') : t('learning.reports.compliance.load')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasLoaded || !report?.rows?.length || download.isPending}
              onClick={handleExport}
            >
              <Download className="size-4 mr-1.5" aria-hidden="true" />
              {download.isPending ? t('learning.reports.exporting') : t('learning.reports.export')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ComplianceReportFilters
          filters={filters}
          onFilterChange={setFilter}
          assignments={assignments}
          programs={programs}
          departments={departments}
          managers={managers}
        />
        {invalidDueRange && (
          <p role="alert" className="text-small text-destructive">
            {t('learning.reports.compliance.invalidDueRange')}
          </p>
        )}
        {body}
      </CardContent>
    </Card>
  );
}
