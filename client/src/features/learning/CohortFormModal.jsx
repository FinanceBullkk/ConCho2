import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateCohort, useLearningPrograms } from '../../hooks/useLearning';
import { LearningField, EnumSelect, controlClass } from './LearningField';

const STATUSES = ['Ongoing', 'Completed'];

// Create a Cohort (a run of a Program). Cohort edit/delete lives in CohortEditModal
// (opened from the Cohorts tab).
export default function CohortFormModal({ onClose }) {
  const { t } = useTranslation();
  const createMutation = useCreateCohort();
  const { data: programsData } = useLearningPrograms({ status: 'active' });
  const programs = programsData?.data || [];

  const [programId, setProgramId] = useState('');
  const [cohortCode, setCohortCode] = useState('');
  const [totalSessions, setTotalSessions] = useState('');
  const [status, setStatus] = useState('Ongoing');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!programId) { setError(t('learning.fields.selectProgram')); return; }
    const payload = { programId, status };
    if (cohortCode.trim()) payload.cohortCode = cohortCode.trim();
    if (totalSessions) payload.totalSessions = Number(totalSessions);
    try {
      await createMutation.mutateAsync(payload);
      toast.success(t('learning.cohorts.created'));
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || t('learning.saveFailed'));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md p-6 space-y-4" aria-label={t('learning.cohorts.create')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-h3 text-foreground">{t('learning.cohorts.create')}</DialogTitle>
          </DialogHeader>

          {error && (
            <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>
          )}

          <LearningField label={t('learning.fields.program')}>
            <select value={programId} onChange={(e) => setProgramId(e.target.value)} required className={controlClass}>
              <option value="" className="bg-popover">{t('learning.fields.selectProgram')}</option>
              {programs.map((p) => (
                <option key={p._id} value={p._id} className="bg-popover">{p.name} ({p.code})</option>
              ))}
            </select>
          </LearningField>

          <LearningField label={t('learning.fields.cohortCode')} hint={t('learning.fields.cohortCodeHint')}>
            <input value={cohortCode} onChange={(e) => setCohortCode(e.target.value)} className={controlClass} />
          </LearningField>

          <div className="grid grid-cols-2 gap-4">
            <LearningField label={t('learning.fields.totalSessions')}>
              <input type="number" min={1} max={200} value={totalSessions}
                onChange={(e) => setTotalSessions(e.target.value)} className={controlClass} />
            </LearningField>
            <LearningField label={t('learning.fields.status')}>
              <EnumSelect value={status} onChange={setStatus} options={STATUSES} labelFor={(v) => t(`learning.status.${v}`)} />
            </LearningField>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">{t('learning.actions.cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending} className="flex-1">
              {createMutation.isPending ? t('learning.actions.creating') : t('learning.actions.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
