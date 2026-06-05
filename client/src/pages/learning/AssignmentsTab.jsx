import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Archive, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useArchiveAssignment, useLearningAssignments } from '../../hooks/useLearning';
import { useRole } from '../../hooks/useRole';
import AssignmentFormModal from './AssignmentFormModal';

const SUMMARY_KEYS = ['complete', 'in_progress', 'overdue', 'not_started'];
const SUMMARY_TONES = {
  complete: 'success',
  in_progress: 'info',
  overdue: 'danger',
  not_started: 'neutral',
};

const formatDate = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
};

const targetName = (assignment) => {
  const target = assignment.target || {};
  return target.name || target.title || '';
};

const plural = (count, singular, pluralLabel) => (count === 1 ? singular : pluralLabel);

function TargetCounts({ assignment }) {
  const { t } = useTranslation();
  const departments = assignment.departments?.length || assignment.departmentIds?.length || 0;
  const users = assignment.users?.length || assignment.userIds?.length || 0;
  const labels = [];
  if (departments) labels.push(`${departments} ${plural(departments, t('learning.assignments.department'), t('learning.assignments.departmentsShort'))}`);
  if (users) labels.push(`${users} ${plural(users, t('learning.assignments.user'), t('learning.assignments.usersShort'))}`);
  return labels.length ? labels.join(' + ') : t('learning.assignments.noTargets');
}

function SummaryBadges({ summary = {} }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5">
      {SUMMARY_KEYS.map((key) => (
        <Badge key={key} variant={SUMMARY_TONES[key]} size="sm">
          {summary[key] || 0} {t(`learning.assignments.status.${key}`)}
        </Badge>
      ))}
    </div>
  );
}

export default function AssignmentsTab() {
  const { t } = useTranslation();
  const { can } = useRole();
  const canManage = can('manage:assignments');
  const { data, isLoading } = useLearningAssignments({ status: 'active' });
  const archiveMutation = useArchiveAssignment();
  const assignments = data?.data || [];
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmArchiveId, setConfirmArchiveId] = useState(null);

  const archiveAssignment = async (assignment) => {
    if (confirmArchiveId !== assignment._id) {
      setConfirmArchiveId(assignment._id);
      return;
    }
    try {
      await archiveMutation.mutateAsync(assignment._id);
      toast.success(t('learning.assignments.archived'));
      setConfirmArchiveId(null);
    } catch (err) {
      toast.error(err.response?.data?.message || t('learning.saveFailed'));
    }
  };

  const header = (
    <div className="flex items-center justify-between">
      <CardTitle>{t('learning.assignments.title')}</CardTitle>
      {canManage && (
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus className="size-4 mr-1.5" aria-hidden="true" />{t('learning.assignments.new')}
        </Button>
      )}
    </div>
  );

  let body;
  if (isLoading) {
    body = <TableSkeleton rows={5} cols={6} />;
  } else if (!assignments.length) {
    body = (
      <Card>
        <CardHeader>{header}</CardHeader>
        <CardContent>
          <EmptyState title={t('learning.assignments.empty')} description={t('learning.assignments.emptyDesc')} />
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
                <TableHead>{t('learning.assignments.colAssignment')}</TableHead>
                <TableHead>{t('learning.assignments.colTarget')}</TableHead>
                <TableHead>{t('learning.assignments.colDue')}</TableHead>
                <TableHead>{t('learning.assignments.colProgress')}</TableHead>
                <TableHead>{t('learning.assignments.colAudience')}</TableHead>
                {canManage && <TableHead className="text-right">{t('learning.cohorts.colActions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment) => (
                <TableRow key={assignment._id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{assignment.title}</div>
                    {assignment.description && <div className="text-small text-muted-foreground">{assignment.description}</div>}
                  </TableCell>
                  <TableCell>
                    <div>{targetName(assignment)}</div>
                    <div className="text-small text-muted-foreground">{assignment.target?.code}</div>
                  </TableCell>
                  <TableCell>{formatDate(assignment.dueDate)}</TableCell>
                  <TableCell><SummaryBadges summary={assignment.summary} /></TableCell>
                  <TableCell><TargetCounts assignment={assignment} /></TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant={confirmArchiveId === assignment._id ? 'destructive' : 'outline'}
                        onClick={() => archiveAssignment(assignment)}
                        disabled={archiveMutation.isPending}
                      >
                        <Archive className="size-4 mr-1.5" aria-hidden="true" />
                        {confirmArchiveId === assignment._id ? t('learning.assignments.archiveConfirm') : t('learning.assignments.archive')}
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
      {modalOpen && <AssignmentFormModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
