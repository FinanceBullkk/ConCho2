import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useDeletedCohorts, useRestoreCohort } from '../../hooks/useLearning';

// Trash view for soft-archived cohorts — Restore returns one to active.
export default function ArchivedCohortsPanel({ onBack }) {
  const { t } = useTranslation();
  const { data: cohorts = [], isLoading } = useDeletedCohorts();
  const restore = useRestoreCohort();

  const handleRestore = async (cohort) => {
    try {
      await restore.mutateAsync(cohort._id);
      toast.success(t('learning.cohorts.restored', 'Cohort restored'));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Restore failed');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t('learning.cohorts.archivedTitle', 'Archived cohorts')}</CardTitle>
          <Button size="sm" variant="outline" onClick={onBack}>
            <ArrowLeft className="size-4 mr-1.5" aria-hidden="true" />{t('learning.cohorts.backToActive', 'Active cohorts')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : !cohorts.length ? (
          <EmptyState title={t('learning.cohorts.archivedEmpty', 'No archived cohorts')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('learning.cohorts.colCohort')}</TableHead>
                <TableHead>{t('learning.cohorts.colProgram')}</TableHead>
                <TableHead>{t('learning.cohorts.colStatus')}</TableHead>
                <TableHead className="text-right">{t('learning.cohorts.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cohorts.map((cohort) => (
                <TableRow key={cohort._id}>
                  <TableCell className="font-medium">{cohort.cohortCode}</TableCell>
                  <TableCell>{cohort.programName}</TableCell>
                  <TableCell>{t(`learning.status.${cohort.status}`, cohort.status)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => handleRestore(cohort)} disabled={restore.isPending}>
                      <RotateCcw className="size-4 mr-1.5" aria-hidden="true" />{t('learning.cohorts.restore', 'Restore')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
