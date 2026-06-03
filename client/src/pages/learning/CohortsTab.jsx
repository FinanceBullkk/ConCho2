import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useLearningCohorts } from '../../hooks/useLearning';
import { useRole } from '../../hooks/useRole';
import CohortFormModal from './CohortFormModal';
import EnrollLearnersModal from './EnrollLearnersModal';

const statusTone = { Ongoing: 'default', Completed: 'secondary' };

export default function CohortsTab() {
  const { t } = useTranslation();
  const { can } = useRole();
  const canCreate = can('create:cohort');
  const canEnroll = can('enroll:learner');
  const { data, isLoading } = useLearningCohorts();
  const cohorts = data?.data || [];

  const [createOpen, setCreateOpen] = useState(false);
  const [enrollCohort, setEnrollCohort] = useState(null);

  const header = (
    <div className="flex items-center justify-between">
      <CardTitle>{t('learning.cohorts.title')}</CardTitle>
      {canCreate && (
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-1.5" aria-hidden="true" />{t('learning.cohorts.new')}
        </Button>
      )}
    </div>
  );

  let body;
  if (isLoading) {
    body = <TableSkeleton rows={6} cols={5} />;
  } else if (!cohorts.length) {
    body = (
      <Card>
        <CardHeader>{header}</CardHeader>
        <CardContent>
          <EmptyState title={t('learning.cohorts.empty')} description={t('learning.cohorts.emptyDesc')} />
        </CardContent>
      </Card>
    );
  } else {
    body = (
      <Card>
        <CardHeader>{header}</CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('learning.cohorts.colCohort')}</TableHead>
                <TableHead>{t('learning.cohorts.colProgram')}</TableHead>
                <TableHead>{t('learning.cohorts.colStatus')}</TableHead>
                <TableHead className="text-right">{t('learning.cohorts.colSessions')}</TableHead>
                <TableHead className="text-right">{t('learning.cohorts.colBooked')}</TableHead>
                {canEnroll && <TableHead className="text-right">{t('learning.cohorts.colActions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cohorts.map((cohort) => (
                <TableRow key={cohort._id}>
                  <TableCell className="font-medium">{cohort.cohortCode}</TableCell>
                  <TableCell>{cohort.programName}</TableCell>
                  <TableCell>
                    <Badge variant={statusTone[cohort.status] || 'secondary'}>{t(`learning.status.${cohort.status}`, cohort.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{cohort.totalSessions}</TableCell>
                  <TableCell className="text-right">{cohort.bookedSessions}</TableCell>
                  {canEnroll && (
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setEnrollCohort(cohort)}>
                        <UserPlus className="size-4 mr-1.5" aria-hidden="true" />{t('learning.cohorts.manage')}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {body}
      {createOpen && <CohortFormModal onClose={() => setCreateOpen(false)} />}
      {enrollCohort && <EnrollLearnersModal cohort={enrollCohort} onClose={() => setEnrollCohort(null)} />}
    </>
  );
}
