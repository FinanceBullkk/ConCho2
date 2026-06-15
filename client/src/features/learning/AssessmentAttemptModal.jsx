import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Clock, Check, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSubmitAssessmentAttempt } from '../../hooks/useAssessment';
import { textareaClass } from './LearningField';
import { formatClock, shuffleItems, answeredCount } from './assessment-runner-utils';

const toggleIndex = (values, idx, multi) => {
  if (!multi) return [idx];
  return values.includes(idx) ? values.filter((v) => v !== idx) : [...values, idx];
};

const buildAnswers = (items, answers) =>
  items.map((item) => {
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

// Post-submit summary shown only when the assessment has `showAnswersAfter`.
// Reveals per-question right/wrong (never the answer key — a learner with
// attempts left must not be able to read off the correct option).
function AttemptResult({ result, items, onClose, t }) {
  const byItem = new Map((result.answers || []).map((a) => [String(a.itemId), a]));
  return (
    <div className="space-y-4" data-testid="attempt-result">
      <div className="rounded-md border border-border p-4">
        <div className="text-sm text-muted-foreground">{t('learning.assessments.yourScore')}</div>
        <div className="text-h3 font-semibold tabular-nums text-foreground">
          {Math.round(result.scorePercent)}% · {result.passed ? t('learning.assessments.passed') : t('learning.assessments.notPassed')}
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item, idx) => {
          const a = byItem.get(String(item.id));
          const correct = a?.correct;
          return (
            <div key={item.id} className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
              <span className={`mt-0.5 ${correct ? 'text-success' : 'text-destructive'}`}>
                {correct ? <Check className="size-4" aria-label={t('learning.assessments.correctMark')} /> : <X className="size-4" aria-label={t('learning.assessments.incorrectMark')} />}
              </span>
              <span className="flex-1 text-foreground">{idx + 1}. {item.prompt}</span>
              <span className="tabular-nums text-muted-foreground">{a?.pointsEarned ?? 0}/{a?.pointsPossible ?? item.points}</span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={onClose}>{t('learning.actions.close')}</Button>
      </div>
    </div>
  );
}

export default function AssessmentAttemptModal({ assessment, onClose, preview = false }) {
  const { t } = useTranslation();
  const submit = useSubmitAssessmentAttempt();
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const submittedRef = useRef(false);

  // Stable display order — shuffled once per attempt when enabled.
  const items = useMemo(
    () => shuffleItems(assessment.items, assessment.shuffleQuestions),
    [assessment.items, assessment.shuffleQuestions],
  );

  const limitSec = (assessment.timeLimitMinutes || 0) * 60;
  const [remaining, setRemaining] = useState(limitSec);
  const answered = answeredCount(items, answers);

  const setAnswer = (itemId, value) => setAnswers((prev) => ({
    ...prev,
    [itemId]: { ...(prev[itemId] || {}), ...value },
  }));

  const doSubmit = async (auto = false) => {
    if (submittedRef.current) return;
    if (preview) {
      submittedRef.current = true;
      toast.info(t('learning.assessments.previewDone'));
      onClose();
      return;
    }
    submittedRef.current = true;
    setError('');
    try {
      const attempt = await submit.mutateAsync({
        assessmentId: assessment.id,
        answers: buildAnswers(assessment.items, answers),
      });
      if (assessment.showAnswersAfter) {
        setResult(attempt); // keep the modal open to reveal right/wrong
        return;
      }
      toast.success(
        attempt.passed ? t('learning.assessments.attemptPassed') : t('learning.assessments.attemptSubmitted'),
      );
      onClose();
    } catch (err) {
      submittedRef.current = false; // let the learner retry on a transient error
      if (auto) toast.error(t('learning.assessments.timeUp'));
      setError(err.response?.data?.message || t('learning.saveFailed'));
    }
  };

  // Keep an always-fresh submit handler for the timer's auto-submit.
  const autoSubmitRef = useRef();
  useEffect(() => { autoSubmitRef.current = () => doSubmit(true); });

  // Countdown — auto-submits at zero. Stops once a result is shown.
  useEffect(() => {
    if (!limitSec || result) return undefined;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          if (!submittedRef.current) autoSubmitRef.current?.();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [limitSec, result]);

  const handleSubmit = (e) => { e.preventDefault(); doSubmit(false); };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl p-6 max-h-[90vh] overflow-y-auto" aria-label={assessment.title}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-h3 text-foreground">
              {preview && <span className="mr-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary align-middle">{t('learning.assessments.previewTitle')}</span>}
              {assessment.title}
            </DialogTitle>
            {limitSec > 0 && !result && (
              <span
                data-testid="exam-timer"
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-semibold tabular-nums ${remaining <= 60 ? 'border-destructive/40 bg-destructive-tint text-destructive' : 'border-border text-foreground'}`}
                aria-label={t('learning.assessments.timeRemaining')}
              >
                <Clock className="size-4" aria-hidden="true" />{formatClock(remaining)}
              </span>
            )}
          </div>
          <DialogDescription>
            {preview ? t('learning.assessments.previewHint') : t('learning.assessments.attemptDescription')}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <AttemptResult result={result} items={items} onClose={onClose} t={t} />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {assessment.description && <p className="text-sm text-muted-foreground">{assessment.description}</p>}
            {error && (
              <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>
            )}

            <div className="space-y-4">
              {items.map((item, idx) => (
                <section key={item.id} className="rounded-md border border-border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">{idx + 1}. {item.prompt}</h3>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {item.points} {t('learning.assessments.points')}
                    </span>
                  </div>
                  {item.type === 'short_text' ? (
                    <textarea
                      value={answers[item.id]?.text || ''}
                      onChange={(e) => setAnswer(item.id, { text: e.target.value })}
                      className={textareaClass}
                      required={!preview}
                    />
                  ) : (
                    <ChoiceItem item={item} value={answers[item.id] || {}} onChange={(value) => setAnswer(item.id, value)} />
                  )}
                </section>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground tabular-nums" data-testid="answered-count">
                {t('learning.assessments.answered', { n: answered, total: items.length })}
              </span>
              <Button type="button" variant="outline" onClick={onClose} className="ml-auto">{t('learning.actions.cancel')}</Button>
              <Button type="submit" disabled={submit.isPending}>
                {submit.isPending
                  ? t('learning.assessments.submitting')
                  : preview ? t('learning.assessments.finishPreview') : t('learning.assessments.submit')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
