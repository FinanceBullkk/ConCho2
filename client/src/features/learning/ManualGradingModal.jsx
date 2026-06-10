import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useAssessmentAttempts, useManualGradeAttempt } from '../../hooks/useAssessment';
import { controlClass, textareaClass } from './LearningField';

const keyOf = (attemptId, itemId) => `${attemptId}:${itemId}`;

export default function ManualGradingModal({ assessment, onClose }) {
  const { t } = useTranslation();
  const { data, isLoading } = useAssessmentAttempts({ assessmentId: assessment.id });
  const attempts = data?.data || [];
  const shortItems = (assessment.items || []).filter((item) => item.type === 'short_text');
  const itemsById = new Map(shortItems.map((item) => [item.id, item]));
  const gradeMutation = useManualGradeAttempt();
  const [grades, setGrades] = useState({});
  const [error, setError] = useState('');

  const valueFor = (attempt, answer, field) => {
    const key = keyOf(attempt.id, answer.itemId);
    if (grades[key]?.[field] !== undefined) return grades[key][field];
    if (field === 'pointsEarned') return answer.manualPointsEarned ?? answer.pointsEarned ?? 0;
    return answer.manualNote || '';
  };

  const setGrade = (attemptId, itemId, field, value) => {
    const key = keyOf(attemptId, itemId);
    setGrades((current) => ({ ...current, [key]: { ...(current[key] || {}), [field]: value } }));
  };

  const saveAttempt = async (attempt) => {
    setError('');
    const answers = attempt.answers
      .filter((answer) => itemsById.has(String(answer.itemId)))
      .map((answer) => ({
        itemId: answer.itemId,
        pointsEarned: Number(valueFor(attempt, answer, 'pointsEarned')),
        note: String(valueFor(attempt, answer, 'note') || ''),
      }));

    const invalid = answers.find((answer) => {
      const possible = attempt.answers.find((a) => String(a.itemId) === String(answer.itemId))?.pointsPossible ?? 0;
      return Number.isNaN(answer.pointsEarned) || answer.pointsEarned < 0 || answer.pointsEarned > possible;
    });
    if (invalid) {
      setError(t('learning.assessments.reviewInvalidScore'));
      return;
    }
    await gradeMutation.mutateAsync({ attemptId: attempt.id, answers });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl p-6 max-h-[90vh] overflow-y-auto" aria-label={t('learning.assessments.review')}>
        <DialogHeader>
          <DialogTitle className="text-h3 text-foreground">{t('learning.assessments.review')}</DialogTitle>
        </DialogHeader>
        {error && (
          <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>
        )}
        {isLoading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : !attempts.length || !shortItems.length ? (
          <EmptyState title={t('learning.assessments.noReviewItems')} description={t('learning.assessments.noReviewItemsDesc')} />
        ) : (
          <div className="space-y-4">
            {attempts.map((attempt) => {
              const reviewAnswers = attempt.answers.filter((answer) => itemsById.has(String(answer.itemId)));
              if (!reviewAnswers.length) return null;
              return (
                <div key={attempt.id} className="rounded-md border border-border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{attempt.learner?.name || attempt.learner?.empCode || '-'}</div>
                      <div className="text-xs text-muted-foreground">{attempt.scorePercent}% · {attempt.passed ? t('learning.assessments.attemptPassed') : t('learning.assessments.attemptNotPassed')}</div>
                    </div>
                    <Button size="sm" onClick={() => saveAttempt(attempt)} disabled={gradeMutation.isPending}>
                      {t('learning.assessments.saveReview')}
                    </Button>
                  </div>
                  {reviewAnswers.map((answer) => {
                    const item = itemsById.get(String(answer.itemId));
                    return (
                      <div key={answer.itemId} className="grid gap-3 md:grid-cols-[1fr_120px_220px]">
                        <div>
                          <div className="text-sm font-medium">{item.prompt}</div>
                          <div className="text-sm text-muted-foreground">{answer.text || '-'}</div>
                        </div>
                        <input
                          aria-label={`${item.prompt} ${t('learning.assessments.points')}`}
                          type="number"
                          min={0}
                          max={answer.pointsPossible}
                          value={valueFor(attempt, answer, 'pointsEarned')}
                          onChange={(e) => setGrade(attempt.id, answer.itemId, 'pointsEarned', e.target.value)}
                          className={controlClass}
                        />
                        <textarea
                          aria-label={`${item.prompt} ${t('learning.assessments.reviewNote')}`}
                          value={valueFor(attempt, answer, 'note')}
                          onChange={(e) => setGrade(attempt.id, answer.itemId, 'note', e.target.value)}
                          className={textareaClass}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>{t('learning.actions.cancel')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
