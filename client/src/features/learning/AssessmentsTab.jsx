import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, ClipboardCheck, Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useAssessments, useArchiveAssessment } from '../../hooks/useAssessment';
import { useLearningCohorts } from '../../hooks/useLearning';
import { useRole } from '../../hooks/useRole';
import AssessmentFormModal from './AssessmentFormModal';
import QuestionBankPanel from './QuestionBankPanel';
import ManualGradingModal from './ManualGradingModal';

export default function AssessmentsTab() {
  const { t } = useTranslation();
  const { can } = useRole();
  const canManage = can('manage:assessment');
  const [cohortId, setCohortId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState(null);
  const [reviewAssessment, setReviewAssessment] = useState(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState('');

  const { data: cohortData } = useLearningCohorts();
  const cohorts = cohortData?.data || [];
  const { data, isLoading } = useAssessments(cohortId ? { cohortId } : {});
  const assessments = data?.data || [];
  const archiveMutation = useArchiveAssessment();

  const handleArchive = async (id) => {
    if (confirmArchiveId !== id) {
      setConfirmArchiveId(id);
      return;
    }
    await archiveMutation.mutateAsync(id);
    setConfirmArchiveId('');
  };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <CardTitle>{t('learning.assessments.title')}</CardTitle>
      <div className="flex items-center gap-2">
        <Select value={cohortId || 'all'} onValueChange={(v) => setCohortId(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[240px]" aria-label={t('learning.reports.cohortLabel')}>
            <SelectValue placeholder={t('learning.assessments.allCohorts')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('learning.assessments.allCohorts')}</SelectItem>
            {cohorts.map((c) => (
              <SelectItem key={c._id} value={c._id}>{c.cohortCode} - {c.programName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1.5" aria-hidden="true" />
            {t('learning.assessments.new')}
          </Button>
        )}
      </div>
    </div>
  );

  let body;
  if (isLoading) {
    body = <TableSkeleton rows={6} cols={6} />;
  } else if (!assessments.length) {
    body = (
      <EmptyState
        title={t('learning.assessments.empty')}
        description={t(cohortId ? 'learning.assessments.emptyCohortDesc' : 'learning.assessments.emptyDesc')}
      />
    );
  } else {
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('learning.assessments.colAssessment')}</TableHead>
            <TableHead>{t('learning.reports.cohortLabel')}</TableHead>
            <TableHead>{t('learning.assessments.colStatus')}</TableHead>
            <TableHead className="text-right">{t('learning.assessments.colItems')}</TableHead>
            <TableHead className="text-right">{t('learning.assessments.colPassing')}</TableHead>
            {canManage && <TableHead className="text-right">{t('learning.cohorts.colActions')}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {assessments.map((assessment) => (
            <TableRow key={assessment.id}>
              <TableCell>
                <div className="font-medium">{assessment.title}</div>
                {assessment.description && (
                  <div className="text-xs text-muted-foreground line-clamp-1">{assessment.description}</div>
                )}
              </TableCell>
              <TableCell>{assessment.cohortCode || '-'}</TableCell>
              <TableCell>
                <Badge variant={assessment.isPublished ? 'default' : 'secondary'}>
                  {assessment.isPublished ? t('learning.assessments.published') : t('learning.assessments.draft')}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{assessment.itemCount}</TableCell>
              <TableCell className="text-right">{assessment.passingScorePercent}%</TableCell>
              {canManage && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingAssessment(assessment)}>
                      <Pencil className="size-4 mr-1.5" aria-hidden="true" />
                      {t('learning.assessments.edit')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setReviewAssessment(assessment)}>
                      <ClipboardCheck className="size-4 mr-1.5" aria-hidden="true" />
                      {t('learning.assessments.review')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={archiveMutation.isPending}
                      onClick={() => handleArchive(assessment.id)}
                    >
                      <Archive className="size-4 mr-1.5" aria-hidden="true" />
                      {confirmArchiveId === assessment.id ? t('learning.assessments.archiveConfirm') : t('learning.programs.archive')}
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>{header}</CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
      {createOpen && (
        <AssessmentFormModal
          cohorts={cohorts}
          selectedCohortId={cohortId}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {editingAssessment && (
        <AssessmentFormModal
          cohorts={cohorts}
          selectedCohortId={cohortId}
          assessment={editingAssessment}
          onClose={() => setEditingAssessment(null)}
        />
      )}
      {reviewAssessment && (
        <ManualGradingModal
          assessment={reviewAssessment}
          onClose={() => setReviewAssessment(null)}
        />
      )}
      {canManage && <div className="mt-4"><QuestionBankPanel /></div>}
    </>
  );
}
