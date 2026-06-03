import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateQuestionBankItem } from '../../hooks/useAssessment';
import { LearningField, EnumSelect, controlClass, textareaClass } from './LearningField';
import {
  ASSESSMENT_ITEM_TYPES,
  blankAssessmentItem,
  itemPayload,
} from './assessment-form-utils';

export default function QuestionBankFormModal({ onClose }) {
  const { t } = useTranslation();
  const createMutation = useCreateQuestionBankItem();
  const [item, setItem] = useState({ ...blankAssessmentItem, tagsText: '' });
  const [error, setError] = useState('');
  const set = (key) => (value) => setItem((row) => ({ ...row, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createMutation.mutateAsync({
        ...itemPayload(item),
        tags: item.tagsText.split(',').map((v) => v.trim()).filter(Boolean),
      });
      toast.success(t('learning.assessments.bankCreated'));
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || t('learning.saveFailed'));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl p-6" aria-label={t('learning.assessments.bankNew')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-h3 text-foreground">{t('learning.assessments.bankNew')}</DialogTitle>
          </DialogHeader>
          {error && (
            <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>
          )}
          <div className="grid gap-3 md:grid-cols-[1fr_180px_100px]">
            <LearningField label={t('learning.assessments.prompt')}>
              <input aria-label={t('learning.assessments.prompt')} value={item.prompt} onChange={(e) => set('prompt')(e.target.value)} required className={controlClass} />
            </LearningField>
            <LearningField label={t('learning.assessments.type')}>
              <EnumSelect aria-label={t('learning.assessments.type')} value={item.type} onChange={set('type')} options={ASSESSMENT_ITEM_TYPES} labelFor={(v) => t(`learning.assessments.types.${v}`)} />
            </LearningField>
            <LearningField label={t('learning.assessments.points')}>
              <input aria-label={t('learning.assessments.points')} type="number" min={0} max={100} value={item.points} onChange={(e) => set('points')(e.target.value)} className={controlClass} />
            </LearningField>
          </div>
          {item.type === 'short_text' ? (
            <LearningField label={t('learning.assessments.acceptedAnswers')} hint={t('learning.assessments.onePerLine')}>
              <textarea aria-label={t('learning.assessments.acceptedAnswers')} value={item.acceptedText} onChange={(e) => set('acceptedText')(e.target.value)} required className={textareaClass} />
            </LearningField>
          ) : (
            <div className="grid gap-3 md:grid-cols-[1fr_220px]">
              <LearningField label={t('learning.assessments.options')} hint={t('learning.assessments.onePerLine')}>
                <textarea aria-label={t('learning.assessments.options')} value={item.optionsText} onChange={(e) => set('optionsText')(e.target.value)} required className={textareaClass} />
              </LearningField>
              <LearningField label={t('learning.assessments.correct')} hint={t('learning.assessments.correctHint')}>
                <input aria-label={t('learning.assessments.correct')} value={item.correctText} onChange={(e) => set('correctText')(e.target.value)} required className={controlClass} />
              </LearningField>
            </div>
          )}
          <LearningField label={t('learning.assessments.tags')} hint={t('learning.assessments.tagsHint')}>
            <input aria-label={t('learning.assessments.tags')} value={item.tagsText} onChange={(e) => set('tagsText')(e.target.value)} className={controlClass} />
          </LearningField>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>{t('learning.actions.cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? t('learning.actions.creating') : t('learning.actions.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
