import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUpdateCohort, useDeleteCohort } from '../../hooks/useLearning';

const STATUSES = ['Ongoing', 'Completed'];

// Edit a cohort's status + total sessions, or delete it. Cohort edit/delete used
// to live in the legacy ClassesPage (now removed); it lives here in the /learning
// Cohorts tab. Delete is cascade-guarded server-side (blocks if groups/sessions
// still reference the cohort).
export default function CohortEditModal({ cohort, onClose }) {
  const { t } = useTranslation();
  const updateMutation = useUpdateCohort();
  const deleteMutation = useDeleteCohort();
  const [status, setStatus] = useState(cohort.status);
  const [totalSessions, setTotalSessions] = useState(cohort.totalSessions);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await updateMutation.mutateAsync({
        id: cohort._id,
        data: { status, totalSessions: Number(totalSessions) },
      });
      toast.success(t('learning.cohorts.updated', 'Cohort updated'));
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Save failed');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setError('');
    try {
      await deleteMutation.mutateAsync(cohort._id);
      toast.success(t('learning.cohorts.archived', 'Cohort archived (recoverable)'));
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Delete failed');
      setConfirmDelete(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md p-6 space-y-4" aria-label={`Edit cohort ${cohort.cohortCode}`}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-h3 text-foreground">
              {t('learning.cohorts.editTitle', 'Edit cohort')}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-0.5">
              <span className="font-mono text-primary">{cohort.cohortCode}</span>
              <span className="text-subtle-foreground mx-1.5">·</span>
              {cohort.programName}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-small text-muted-foreground mb-1">
                {t('learning.cohorts.colStatus')}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s} className="bg-popover">{t(`learning.status.${s}`, s)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-small text-muted-foreground mb-1">
                {t('learning.cohorts.colSessions')}
              </label>
              <input
                type="number"
                min={1}
                value={totalSessions}
                onChange={(e) => setTotalSessions(e.target.value)}
                className="w-full px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending
                ? '…'
                : confirmDelete
                  ? t('common.confirmDelete', 'Confirm delete?')
                  : t('common.delete', 'Delete')}
            </Button>
            {!confirmDelete && (
              <>
                <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button type="submit" disabled={updateMutation.isPending} className="flex-1">
                  {updateMutation.isPending ? '…' : t('common.save', 'Save')}
                </Button>
              </>
            )}
            {confirmDelete && (
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)} className="flex-1">
                {t('common.keep', 'Keep')}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
