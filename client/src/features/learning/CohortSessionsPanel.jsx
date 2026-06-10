import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useLearningSessions } from '../../hooks/useLearning';
import { useRole } from '../../hooks/useRole';
import AssignTrainersModal from './AssignTrainersModal';

// ──────────────────────────────────────────────────────────
// CohortSessionsPanel — a cohort's sessions + their assigned trainers.
//
// The home for trainer assignment (re-center Phase 3): there was no per-cohort
// session list before, so a scheduler could create a session but never see it
// again to assign trainers. Takes over the Cohorts tab (like ArchivedCohortsPanel)
// rather than nesting in a modal, so AssignTrainersModal opens over a plain panel.
//
// Props:
//   cohort — { _id, cohortCode, programName }
//   onBack — return to the cohort list
// ──────────────────────────────────────────────────────────

// Compact local date + time for a session start (runs in the viewer's timezone).
const formatWhen = (iso) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// Internal trainer names + the external trainer (tagged), or a muted placeholder.
function TrainerCell({ session }) {
  const { t } = useTranslation();
  const internal = session.sessionInstructors || [];
  const ext = session.externalTrainer;
  if (!internal.length && !ext) {
    return <span className="text-xs text-subtle-foreground">{t('learning.trainers.none')}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {internal.map((tr) => (
        <Badge key={tr._id} variant="secondary">{tr.name}</Badge>
      ))}
      {ext && (
        <Badge variant="outline">{ext.name} · {t('learning.trainers.externalTag')}</Badge>
      )}
    </div>
  );
}

export default function CohortSessionsPanel({ cohort, onBack }) {
  const { t } = useTranslation();
  const { can } = useRole();
  const canAssign = can('assign:trainer');
  // limit 200: the server default (50) silently truncates long-running cohorts;
  // no cohort approaches 200 sessions, so one page covers the full list.
  const { data, isLoading } = useLearningSessions({ cohortId: cohort._id, limit: 200 });
  const sessions = data?.data || [];
  const [trainerSession, setTrainerSession] = useState(null);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {t('learning.sessions.title')}
              <span className="text-subtle-foreground mx-1.5">·</span>
              <span className="font-mono text-primary text-base">{cohort.cohortCode}</span>
            </CardTitle>
            <Button size="sm" variant="outline" onClick={onBack}>
              <ArrowLeft className="size-4 mr-1.5" aria-hidden="true" />{t('learning.sessions.back')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={4} cols={canAssign ? 4 : 3} />
          ) : !sessions.length ? (
            <EmptyState title={t('learning.sessions.empty')} description={t('learning.sessions.emptyDesc')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('learning.sessions.colTime')}</TableHead>
                  <TableHead>{t('learning.sessions.colLocation')}</TableHead>
                  <TableHead>{t('learning.sessions.colTrainers')}</TableHead>
                  {canAssign && <TableHead className="text-right">{t('learning.cohorts.colActions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => {
                  // Durable-cancelled rows stay listed as history for schedulers
                  // (learners/teachers never receive them) — read-only, chipped.
                  const cancelled = s.status === 'cancelled';
                  return (
                    <TableRow key={s._id} className={cancelled ? 'opacity-60' : undefined}>
                      <TableCell className="whitespace-nowrap">
                        {formatWhen(s.startTime)}
                        {cancelled && (
                          <Badge variant="destructive" className="ml-2">
                            {t('learning.sessions.cancelled')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.office?.name || '—'}{s.room ? ` · ${s.room.name}` : ''}
                      </TableCell>
                      <TableCell><TrainerCell session={s} /></TableCell>
                      {canAssign && (
                        <TableCell className="text-right">
                          {!cancelled && (
                            <Button size="sm" variant="outline" onClick={() => setTrainerSession(s)}>
                              <UserCog className="size-4 mr-1.5" aria-hidden="true" />{t('learning.trainers.manage')}
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {trainerSession && (
        <AssignTrainersModal session={trainerSession} onClose={() => setTrainerSession(null)} />
      )}
    </>
  );
}
