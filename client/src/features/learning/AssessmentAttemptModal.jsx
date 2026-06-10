import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSubmitAssessmentAttempt } from '../../hooks/useAssessment';
import { textareaClass } from './LearningField';

const toggleIndex = (values, idx, multi) => {
  if (!multi) return [idx];
  return values.includes(idx) ? values.filter((v) => v !== idx) : [...values, idx];
};

const buildAnswers = (assessment, answers) =>
  assessment.items.map((item) => {
    const value = answers[item.id] || {};
    return item.type === 'short_text'
      ? { itemId: item.id, text: value.text || '' }
      : { itemId: item.id, selectedOptionIndexes: value.selectedOptionIndexes || [] };
  });

function ChoiceItem({ item, value, onChange }) {
  const multi = item.type === 'multiple_choice';
  const selected = value.selectedOptionIndexes || [];
  return (
    <div className="space-y-2">
      {item.options.map((option, idx) => (
        <label key={`${item.id}-${idx}`} className="flex items-start gap-2 rounded-md border border-border p-2 text-sm">
          <input
            type={multi ? 'checkbox' : 'radio'}
            name={item.id}
            checked={selected.includes(idx)}
            onChange={() => onChange({ selectedOptionIndexes: toggleIndex(selected, idx, multi) })}
            className="mt-1"
          />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}

export default function AssessmentAttemptModal({ assessment, onClose }) {
  const { t } = useTranslation();
  const submit = useSubmitAssessmentAttempt();
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');

  const setAnswer = (itemId, value) => setAnswers((prev) => ({
    ...prev,
    [itemId]: { ...(prev[itemId] || {}), ...value },
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const attempt = await submit.mutateAsync({
        assessmentId: assessment.id,
        answers: buildAnswers(assessment, answers),
      });
      toast.success(
        attempt.passed
          ? t('learning.assessments.attemptPassed')
          : t('learning.assessments.attemptSubmitted'),
      );
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || t('learning.saveFailed'));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl p-6 max-h-[90vh] overflow-y-auto" aria-label={assessment.title}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-h3 text-foreground">{assessment.title}</DialogTitle>
            <DialogDescription>
              {t('learning.assessments.attemptDescription')}
            </DialogDescription>
          </DialogHeader>
          {assessment.description && <p className="text-sm text-muted-foreground">{assessment.description}</p>}
          {error && (
            <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>
          )}

          <div className="space-y-4">
            {assessment.items.map((item, idx) => (
              <section key={item.id} className="rounded-md border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    {idx + 1}. {item.prompt}
                  </h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {item.points} {t('learning.assessments.points')}
                  </span>
                </div>
                {item.type === 'short_text' ? (
                  <textarea
                    value={answers[item.id]?.text || ''}
                    onChange={(e) => setAnswer(item.id, { text: e.target.value })}
                    className={textareaClass}
                    required
                  />
                ) : (
                  <ChoiceItem
                    item={item}
                    value={answers[item.id] || {}}
                    onChange={(value) => setAnswer(item.id, value)}
                  />
                )}
              </section>
            ))}
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>{t('learning.actions.cancel')}</Button>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? t('learning.assessments.submitting') : t('learning.assessments.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
