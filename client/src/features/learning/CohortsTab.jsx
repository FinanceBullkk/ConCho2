import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Plus, UserPlus, CalendarPlus, CalendarRange, Pencil, Archive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useLearningCohorts } from '../../hooks/useLearning';
import { useRole } from '../../hooks/useRole';
import { isCohortMode } from '../../lib/scheduling-mode';
import CohortFormModal from './CohortFormModal';
import CohortEditModal from './CohortEditModal';
import ArchivedCohortsPanel from './ArchivedCohortsPanel';
import EnrollLearnersModal from './EnrollLearnersModal';
import CreateSessionModal from './CreateSessionModal';
import CohortSessionsPanel from './CohortSessionsPanel';

const statusTone = { Ongoing: 'default', Completed: 'secondary' };
const WORLD_FILTERS = ['all', 'team', 'cohort'];

// Coordinator-scheduled offline sessions are created against cohort-mode
// programs (self_enroll / nomination), team-less (re-center Phase 2). The
// cohort-mode classification comes from the shared lib (single source of truth).
const isCohortScheduled = (cohort) => isCohortMode(cohort.program?.schedulingMode);

// CohortsTab — the training catalog.
//   mode = 'all'    — UNIFIED catalog (converge Phase 4): lists BOTH scheduling
//                     worlds (team + cohort) with a deliveryType column + world
//                     filter; per-row actions gate by each row's deliveryType, so
//                     an admin no longer hits an "empty" Cohorts tab while the
//                     data sits in the English/team world.
//   mode = 'team'   — English section: reads via /api/english/classes; cohort-
//                     based enroll is hidden (team membership drives enrollment).
//   mode = 'cohort' — legacy cohort-world-only list.
export default function CohortsTab({ mode = 'cohort', titleKey = 'learning.cohorts.title' }) {
  const { t } = useTranslation();
  const { can } = useRole();
  const isUnified = mode === 'all';

  // Unified view fetches BOTH worlds (no mode filter → server returns all).
  const { data, isLoading } = useLearningCohorts(isUnified ? {} : { mode });
  const allCohorts = data?.data || [];

  const [worldFilter, setWorldFilter] = useState('all');
  const cohorts = isUnified && worldFilter !== 'all'
    ? allCohorts.filter((c) => c.deliveryType === worldFilter)
    : allCohorts;

  const canCreate = can('create:cohort');
  const canManage = canCreate; // cohort.manage covers create/edit/delete/restore
  const canSchedule = can('book:session');
  const canAssignTrainers = can('assign:trainer');
  const canEnrollCap = can('enroll:learner');
  // Per-row: cohort-based enroll only applies to cohort-world rows. Team-world
  // rows are enrolled via team membership (the English section), never here.
  const rowCanEnroll = (cohort) => canEnrollCap && cohort.deliveryType === 'cohort';

  const showTypeCol = isUnified;
  const showActions = canEnrollCap || canSchedule || canManage || canAssignTrainers;

  const [createOpen, setCreateOpen] = useState(false);
  const [editCohort, setEditCohort] = useState(null);
  const [enrollCohort, setEnrollCohort] = useState(null);
  const [sessionCohort, setSessionCohort] = useState(null);
  const [sessionsCohort, setSessionsCohort] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const header = (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 flex-wrap">
        <CardTitle>{t(titleKey)}</CardTitle>
        {isUnified && (
          <div className="flex items-center gap-1">
            {WORLD_FILTERS.map((f) => (
              <Button
                key={f}
                size="sm"
                variant={worldFilter === f ? 'default' : 'ghost'}
                onClick={() => setWorldFilter(f)}
              >
                {t(`learning.cohorts.filter_${f}`)}
              </Button>
            ))}
          </div>
        )}
      </div>
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
    body = <TableSkeleton rows={6} cols={showTypeCol ? 6 : 5} />;
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
                {showTypeCol && <TableHead>{t('learning.cohorts.colType')}</TableHead>}
                <TableHead>{t('learning.cohorts.colStatus')}</TableHead>
                <TableHead className="text-right">{t('learning.cohorts.colSessions')}</TableHead>
                <TableHead className="text-right">{t('learning.cohorts.colBooked')}</TableHead>
                {showActions && <TableHead className="text-right">{t('learning.cohorts.colActions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cohorts.map((cohort) => (
                <TableRow key={cohort._id}>
                  <TableCell className="font-medium">
                    <Link to={`/learning/cohorts/${cohort._id}`} className="text-primary hover:underline">{cohort.cohortCode}</Link>
                  </TableCell>
                  <TableCell>{cohort.programName}</TableCell>
                  {showTypeCol && (
                    <TableCell>
                      <Badge variant={cohort.deliveryType === 'cohort' ? 'default' : 'outline'}>
                        {t(`learning.cohorts.type_${cohort.deliveryType}`, cohort.deliveryType)}
                      </Badge>
                    </TableCell>
                  )}
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
                        {/* Sessions (trainer assignment) is offered only where the
                            coordinator-scheduled flow applies — same cohort-mode gate
                            as Schedule session (owner decision, 2026-06-10). */}
                        {canAssignTrainers && isCohortScheduled(cohort) && (
                          <Button size="sm" variant="outline" onClick={() => setSessionsCohort(cohort)}>
                            <CalendarRange className="size-4 mr-1.5" aria-hidden="true" />{t('learning.cohorts.sessions')}
                          </Button>
                        )}
                        {rowCanEnroll(cohort) && (
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

  if (sessionsCohort) {
    return <CohortSessionsPanel cohort={sessionsCohort} onBack={() => setSessionsCohort(null)} />;
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
