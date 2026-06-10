import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, UserPlus, CalendarPlus, Pencil, Archive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useLearningCohorts } from '../../hooks/useLearning';
import { useRole } from '../../hooks/useRole';
import CohortFormModal from './CohortFormModal';
import CohortEditModal from './CohortEditModal';
import ArchivedCohortsPanel from './ArchivedCohortsPanel';
import EnrollLearnersModal from './EnrollLearnersModal';
import CreateSessionModal from './CreateSessionModal';

const statusTone = { Ongoing: 'default', Completed: 'secondary' };

// Coordinator-scheduled offline sessions are created against cohort-mode
// programs (self_enroll / nomination), team-less (re-center Phase 2).
const COHORT_MODES = ['self_enroll', 'nomination'];
const isCohortScheduled = (cohort) => COHORT_MODES.includes(cohort.program?.schedulingMode);

export default function CohortsTab() {
  const { t } = useTranslation();
  const { can } = useRole();
  const canCreate = can('create:cohort');
  const canEnroll = can('enroll:learner');
  const canSchedule = can('book:session');
  const { data, isLoading } = useLearningCohorts();
  const cohorts = data?.data || [];

  const [createOpen, setCreateOpen] = useState(false);
  const [editCohort, setEditCohort] = useState(null);
  const [enrollCohort, setEnrollCohort] = useState(null);
  const [sessionCohort, setSessionCohort] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  // `cohort.manage` (create:cohort) is a single capability covering create/edit/delete/restore.
  const canManage = canCreate;
  const showActions = canEnroll || canSchedule || canManage;

  const header = (
    <div className="flex items-center justify-between">
      <CardTitle>{t('learning.cohorts.title')}</CardTitle>
      <div className="flex items-center gap-2">
        {canManage && (
          <Button size="sm" variant="ghost" onClick={() => setShowArchived(true)}>
            <Archive className="size-4 mr-1.5" aria-hidden="true" />{t('learning.cohorts.viewArchived', 'Archived')}
          </Button>
        )}
        {canCreate && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1.5" aria-hidden="true" />{t('learning.cohorts.new')}
          </Button>
        )}
      </div>
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
                {showActions && <TableHead className="text-right">{t('learning.cohorts.colActions')}</TableHead>}
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
                  {showActions && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canSchedule && isCohortScheduled(cohort) && (
                          <Button size="sm" variant="outline" onClick={() => setSessionCohort(cohort)}>
                            <CalendarPlus className="size-4 mr-1.5" aria-hidden="true" />{t('learning.cohorts.scheduleSession')}
                          </Button>
                        )}
                        {canEnroll && (
                          <Button size="sm" variant="outline" onClick={() => setEnrollCohort(cohort)}>
                            <UserPlus className="size-4 mr-1.5" aria-hidden="true" />{t('learning.cohorts.manage')}
                          </Button>
                        )}
                        {canManage && (
                          <Button size="sm" variant="outline" onClick={() => setEditCohort(cohort)}>
                            <Pencil className="size-4 mr-1.5" aria-hidden="true" />{t('learning.cohorts.edit', 'Edit')}
                          </Button>
                        )}
                      </div>
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

  if (showArchived) {
    return <ArchivedCohortsPanel onBack={() => setShowArchived(false)} />;
  }

  return (
    <>
      {body}
      {createOpen && <CohortFormModal onClose={() => setCreateOpen(false)} />}
      {editCohort && <CohortEditModal cohort={editCohort} onClose={() => setEditCohort(null)} />}
      {enrollCohort && <EnrollLearnersModal cohort={enrollCohort} onClose={() => setEnrollCohort(null)} />}
      {sessionCohort && <CreateSessionModal cohort={sessionCohort} onClose={() => setSessionCohort(null)} />}
    </>
  );
}
