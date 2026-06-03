import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateAssessment, useUpdateAssessment } from '../../hooks/useAssessment';
import { LearningField, EnumSelect, controlClass, textareaClass } from './LearningField';
import {
  ASSESSMENT_ITEM_TYPES,
  assessmentFormValue,
  assessmentItemsValue,
  blankAssessmentItem,
  itemPayload,
} from './assessment-form-utils';

export default function AssessmentFormModal({
  cohorts,
  selectedCohortId,
  assessment,
  onClose,
}) {
  const { t } = useTranslation();
  const createMutation = useCreateAssessment();
  const updateMutation = useUpdateAssessment();
  const isEdit = Boolean(assessment?.id);
  const pending = createMutation.isPending || updateMutation.isPending;
  const [form, setForm] = useState(() => assessmentFormValue(assessment, selectedCohortId));
  const [items, setItems] = useState(() => assessmentItemsValue(assessment));
  const [error, setError] = useState('');

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setItem = (idx, key, value) => setItems((rows) =>
    rows.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));

  const addItem = () => setItems((rows) => [...rows, { ...blankAssessmentItem }]);
  const removeItem = (idx) => setItems((rows) => rows.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      cohortId: form.cohortId,
      passingScorePercent: Number(form.passingScorePercent) || 0,
      maxAttempts: Number(form.maxAttempts) || 0,
      isPublished: Boolean(form.isPublished),
      items: items.map(itemPayload),
    };
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: assessment.id, data: payload });
        toast.success(t('learning.assessments.updated'));
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(t('learning.assessments.created'));
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || t('learning.saveFailed'));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl p-6 max-h-[90vh] overflow-y-auto" aria-label={t(isEdit ? 'learning.assessments.edit' : 'learning.assessments.create')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-h3 text-foreground">{t(isEdit ? 'learning.assessments.edit' : 'learning.assessments.create')}</DialogTitle>
          </DialogHeader>
          {error && (
            <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <LearningField label={t('learning.fields.title')}>
              <input value={form.title} onChange={(e) => set('title')(e.target.value)} required className={controlClass} />
            </LearningField>
            <LearningField label={t('learning.reports.cohortLabel')}>
              <select value={form.cohortId} onChange={(e) => set('cohortId')(e.target.value)} required className={controlClass}>
                <option value="">{t('learning.reports.selectCohort')}</option>
                {cohorts.map((c) => <option key={c._id} value={c._id}>{c.cohortCode} - {c.programName}</option>)}
              </select>
            </LearningField>
            <LearningField label={t('learning.assessments.passing')}>
              <input type="number" min={0} max={100} value={form.passingScorePercent}
                onChange={(e) => set('passingScorePercent')(e.target.value)} className={controlClass} />
            </LearningField>
            <LearningField label={t('learning.assessments.maxAttempts')} hint={t('learning.assessments.unlimitedHint')}>
              <input type="number" min={0} value={form.maxAttempts}
                onChange={(e) => set('maxAttempts')(e.target.value)} className={controlClass} />
            </LearningField>
          </div>

          <LearningField label={t('learning.fields.description')}>
            <textarea value={form.description} onChange={(e) => set('description')(e.target.value)} className={textareaClass} />
          </LearningField>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isPublished} onChange={(e) => set('isPublished')(e.target.checked)} />
            {t('learning.assessments.publishNow')}
          </label>

          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={idx} className="rounded-md border border-border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{t('learning.assessments.item')} {idx + 1}</div>
                  {items.length > 1 && (
                    <Button type="button" variant="outline" size="sm" onClick={() => removeItem(idx)}>
                      {t('learning.actions.remove')}
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_180px_100px]">
                  <LearningField label={t('learning.assessments.prompt')}>
                    <input value={item.prompt} onChange={(e) => setItem(idx, 'prompt', e.target.value)} required className={controlClass} />
                  </LearningField>
                  <LearningField label={t('learning.assessments.type')}>
                    <EnumSelect value={item.type} onChange={(v) => setItem(idx, 'type', v)} options={ASSESSMENT_ITEM_TYPES} labelFor={(v) => t(`learning.assessments.types.${v}`)} />
                  </LearningField>
                  <LearningField label={t('learning.assessments.points')}>
                    <input type="number" min={0} max={100} value={item.points} onChange={(e) => setItem(idx, 'points', e.target.value)} className={controlClass} />
                  </LearningField>
                </div>
                {item.type === 'short_text' ? (
                  <LearningField label={t('learning.assessments.acceptedAnswers')} hint={t('learning.assessments.onePerLine')}>
                    <textarea value={item.acceptedText} onChange={(e) => setItem(idx, 'acceptedText', e.target.value)} required className={textareaClass} />
                  </LearningField>
                ) : (
                  <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                    <LearningField label={t('learning.assessments.options')} hint={t('learning.assessments.onePerLine')}>
                      <textarea value={item.optionsText} onChange={(e) => setItem(idx, 'optionsText', e.target.value)} required className={textareaClass} />
                    </LearningField>
                    <LearningField label={t('learning.assessments.correct')} hint={t('learning.assessments.correctHint')}>
                      <input value={item.correctText} onChange={(e) => setItem(idx, 'correctText', e.target.value)} required className={controlClass} />
                    </LearningField>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={addItem}>{t('learning.assessments.addItem')}</Button>
            <Button type="button" variant="outline" onClick={onClose} className="ml-auto">{t('learning.actions.cancel')}</Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? t(isEdit ? 'learning.actions.saving' : 'learning.actions.creating')
                : t(isEdit ? 'learning.actions.save' : 'learning.actions.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
